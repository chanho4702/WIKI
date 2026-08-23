import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { DetailsView } from "../components/DetailsView";
import { containerMarker } from "./containerMarker";

/**
 * 토글(expand) 블록 — Notion 토글·Confluence expand 대응.
 *
 * ## 저장 포맷 (`⚠️ 저장 포맷 재논의` 결정 결과 — 에디터 상세 갭 분석 §5 A안)
 *
 * 컬럼과 같은 컨테이너 확장 문법을 쓴다. 제목은 remark-directive의 라벨 문법(`[...]`)에 실어
 * 보기 경로가 별도 파싱 없이 같은 값을 읽는다:
 *
 * ```
 * :::details[릴리스 노트]
 * 접히는 내용
 * :::
 * ```
 *
 * 제목이 비어 있으면 라벨을 생략한다(`:::details`). 컨테이너 중첩 시 마커 길이 규칙은
 * `containerMarker.ts` 참조.
 *
 * ## 접힘 상태는 저장하지 않는다
 *
 * 열림/닫힘은 문서가 아니라 보는 사람의 상태다 — 편집 화면은 기본 펼침(접으면 내용을 못
 * 고친다), 보기 화면은 기본 접힘(Confluence expand와 동일)이며 둘 다 로컬 상태로만 다룬다.
 */

export const DETAILS_NAME = "detailsBlock";

/** 여는 줄 — `:::details` 또는 `:::details[제목]`. 마커는 3개 이상. */
const OPEN_RE = /^(:{3,})[ \t]*details[ \t]*(?:\[([^\]]*)\])?[ \t]*$/;

/**
 * 제목에서 문법 충돌 문자를 걷어낸다 — `]`는 라벨을 조기 종료시키고 개행은 여는 줄을
 * 깨뜨린다. 입력(NodeView)과 직렬화 양쪽에서 같은 정규화를 거쳐야 왕복이 안전하다.
 */
export function sanitizeSummary(value: string): string {
  return value.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
}

/* ── markdown-it 규칙 (편집 경로) — columns.ts와 같은 컨테이너 알고리즘 ── */

interface MarkdownItLike {
  block: {
    ruler: {
      before: (
        beforeName: string,
        ruleName: string,
        rule: (state: MarkdownItState, startLine: number, endLine: number, silent: boolean) => boolean,
        options?: { alt?: string[] },
      ) => void;
    };
  };
  renderer: { rules: Record<string, unknown> };
}

interface MarkdownItState {
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  sCount: number[];
  blkIndent: number;
  line: number;
  lineMax: number;
  parentType: string;
  push: (type: string, tag: string, nesting: number) => MarkdownItToken;
  md: { block: { tokenize: (state: MarkdownItState, start: number, end: number) => void } };
}

interface MarkdownItToken {
  markup: string;
  block: boolean;
  info: string;
  map: [number, number] | null;
  attrs?: [string, string][];
}

function detailsRule(state: MarkdownItState, startLine: number, endLine: number, silent: boolean) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;

  const opening = OPEN_RE.exec(state.src.slice(start, max));
  if (!opening) return false;
  if (silent) return true;

  const markerLen = opening[1].length;
  const summary = opening[2] ?? "";

  let nextLine = startLine;
  let autoClosed = false;
  for (;;) {
    nextLine += 1;
    if (nextLine >= endLine) break;
    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
    const lineMax = state.eMarks[nextLine];
    if (state.sCount[nextLine] - state.blkIndent >= 4) continue;
    const closing = /^(:{3,})[ \t]*$/.exec(state.src.slice(lineStart, lineMax));
    if (closing && closing[1].length >= markerLen) {
      autoClosed = true;
      break;
    }
  }

  const oldParent = state.parentType;
  const oldLineMax = state.lineMax;
  state.parentType = "container";
  state.lineMax = nextLine;

  const openToken = state.push("container_details_open", "div", 1);
  openToken.markup = ":".repeat(markerLen);
  openToken.block = true;
  openToken.info = "details";
  openToken.map = [startLine, nextLine];
  if (summary) openToken.attrs = [["data-summary", summary]];

  state.md.block.tokenize(state, startLine + 1, nextLine);

  const closeToken = state.push("container_details_close", "div", -1);
  closeToken.markup = ":".repeat(markerLen);
  closeToken.block = true;

  state.parentType = oldParent;
  state.lineMax = oldLineMax;
  state.line = nextLine + (autoClosed ? 1 : 0);
  return true;
}

const ESCAPE_MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeAttr = (value: string) => value.replace(/[&<>"]/g, (ch) => ESCAPE_MAP[ch]);

const SETUP_FLAG = "__wikiDetailsInstalled";
function setupMarkdownIt(md: MarkdownItLike) {
  const target = md as MarkdownItLike & { [SETUP_FLAG]?: boolean };
  if (target[SETUP_FLAG]) return;
  target[SETUP_FLAG] = true;
  md.block.ruler.before("fence", "wiki_details", detailsRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.renderer.rules.container_details_open = (tokens: MarkdownItToken[], idx: number) => {
    const summary = tokens[idx].attrs?.find(([k]) => k === "data-summary")?.[1];
    return `<div data-type="details"${summary ? ` data-summary="${escapeAttr(summary)}"` : ""}>`;
  };
  md.renderer.rules.container_details_close = () => `</div>`;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiDetails: {
      /** 현재 위치에 빈 토글을 넣고 내용 첫 문단에 커서를 둔다. */
      setDetails: () => ReturnType;
    };
  }
}

interface MarkdownSerializerStateLike {
  write: (text: string) => void;
  ensureNewLine: () => void;
  renderContent: (node: unknown) => void;
  flushClose: (size?: number) => void;
  closeBlock: (node: unknown) => void;
}

export const Details = Node.create({
  name: DETAILS_NAME,
  group: "block",
  content: "block+",
  // isolating: 내용 첫 블록에서 Backspace가 토글 밖으로 새어 블록이 통째로 풀리는 것을 막는다
  isolating: true,

  addAttributes() {
    return {
      summary: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-summary") ?? "",
        renderHTML: (attrs) =>
          attrs.summary ? { "data-summary": String(attrs.summary) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="details"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "details" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DetailsView);
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerStateLike, node: unknown) {
          const n = node as {
            attrs: { summary?: string };
            type: { name: string };
            forEach: (fn: (c: never, o: number, i: number) => void) => void;
          };
          const marker = containerMarker(n);
          const summary = sanitizeSummary(n.attrs.summary ?? "");
          state.write(summary ? `${marker}details[${summary}]` : `${marker}details`);
          state.ensureNewLine();
          state.renderContent(node);
          state.flushClose(1);
          state.write(marker);
          state.closeBlock(node);
        },
        parse: { setup: setupMarkdownIt },
      },
    };
  },

  addCommands() {
    return {
      setDetails:
        () =>
        ({ chain, editor }) => {
          const from = editor.state.selection.from;
          return chain()
            .insertContent({
              type: DETAILS_NAME,
              attrs: { summary: "" },
              content: [{ type: "paragraph" }],
            })
            .command(({ tr, dispatch }) => {
              if (!dispatch) return true;
              // 삽입한 토글의 내용 첫 문단 안으로 커서 이동 — detailsBlock(pos) → paragraph(pos+1) → 안쪽(pos+2)
              let target: number | null = null;
              tr.doc.descendants((node, pos) => {
                if (target !== null) return false;
                if (node.type.name === DETAILS_NAME && pos + 1 >= from - 1) {
                  target = pos + 2;
                  return false;
                }
                return true;
              });
              if (target !== null && target <= tr.doc.content.size) {
                tr.setSelection(TextSelection.create(tr.doc, target));
              }
              return true;
            })
            .focus()
            .run();
        },
    };
  },
});
