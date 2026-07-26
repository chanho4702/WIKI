import { Node, mergeAttributes } from "@tiptap/core";

/**
 * 레이어 분할(컬럼 레이아웃) — 한 줄을 여러 열로 나눠 편집한다.
 *
 * ## 저장 포맷 (`⚠️ 저장 포맷 재논의` 결정 결과)
 *
 * 컬럼은 마크다운 표준으로 표현할 수 없다(로드맵 3단계 항목). 저장 포맷을 블록 JSON으로 바꾸는
 * 대신 **컨테이너 확장 문법(`:::`)** 을 쓰기로 했다 — `Page.body`는 계속 마크다운 문자열이라
 * 백엔드 계약·버전 diff·`[[링크]]` 파이프라인이 그대로 유지된다(CLAUDE.md 불변조건 2 유지).
 *
 * ```
 * ::::columns
 * :::column
 * 왼쪽 내용
 * :::
 * :::column
 * 오른쪽 내용
 * :::
 * ::::
 * ```
 *
 * 중첩은 **바깥 마커가 더 길다**는 규칙으로 구분한다(markdown-it-container·remark-directive 공통
 * 관례). 이 문법을 모르는 렌더러에서는 `:::` 줄이 그대로 텍스트로 보인다 — 내용이 사라지지는
 * 않지만 GFM 표준은 아니라는 점이 이 결정의 대가다.
 *
 * ## 파이프라인 대칭
 *
 * - 편집: 이 파일의 markdown-it 컨테이너 규칙이 `<div data-type="...">`를 만들고, 아래 노드의
 *   `parseHTML`이 그걸 다시 노드로 읽는다(tiptap-markdown은 markdown-it → HTML → TipTap 순서).
 * - 보기: `lib/remarkColumns.ts`가 remark-directive의 컨테이너 지시자를 같은 클래스의 div로 만든다.
 *
 * 두 경로가 같은 문자열을 같은 구조로 읽어야 편집↔보기가 어긋나지 않는다.
 */

export const COLUMN_BLOCK_NAME = "columnBlock";
export const COLUMN_NAME = "column";

/** 새로 만들 때의 기본 열 수 — 컨플루언스 기본 레이아웃과 동일하게 2열. */
export const DEFAULT_COLUMN_COUNT = 2;

/** 지원 열 수. 3열을 넘으면 본문 폭(760px)에서 한 열이 읽을 수 없이 좁아진다. */
export const SUPPORTED_COLUMN_COUNTS = [2, 3] as const;

/** markdown-it 토큰/규칙에 넘길 최소 타입 — markdown-it을 직접 의존하지 않기 위해 좁게 선언한다. */
interface MarkdownItLike {
  block: {
    ruler: {
      before: (
        beforeName: string,
        ruleName: string,
        rule: MarkdownItBlockRule,
        options?: { alt?: string[] },
      ) => void;
    };
  };
  renderer: { rules: Record<string, unknown> };
}

type MarkdownItBlockRule = (
  state: MarkdownItState,
  startLine: number,
  endLine: number,
  silent: boolean,
) => boolean;

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

/** `:::name` 여는 줄. 마커는 3개 이상, 이름은 columns 또는 column. */
const OPEN_RE = /^(:{3,})[ \t]*(columns|column)[ \t]*$/;

/**
 * `:::` 컨테이너 블록 규칙(직접 구현 — markdown-it-container 의존성 없이).
 *
 * 알고리즘은 markdown-it-container와 같다: **중첩 깊이를 세지 않고**, 여는 마커 길이 이상인
 * 닫는 줄을 처음 만나는 곳에서 끝낸다. 중첩이 성립하는 이유는 안쪽이 더 짧은 마커를 쓰기
 * 때문이다 — 안쪽 `:::`는 바깥(`::::`)의 종료 조건(길이 ≥ 4)을 만족하지 못해 바깥을 닫지 못하고,
 * 안쪽 컨테이너는 재귀 tokenize에서 자기 `:::`로 스스로 닫힌다.
 * (깊이를 세면 안쪽 여는 줄에서 올린 깊이를 안쪽 닫는 줄이 내리지 못해 바깥이 영영 안 닫힌다.)
 */
function containerRule(state: MarkdownItState, startLine: number, endLine: number, silent: boolean) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];

  // 들여쓰기된 코드 블록 범위면 컨테이너가 아니다
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;

  const opening = OPEN_RE.exec(state.src.slice(start, max));
  if (!opening) return false;
  // silent 모드는 "이 줄이 이 규칙에 해당하는가"만 묻는다 — 토큰을 만들지 않고 답만 준다
  if (silent) return true;

  const markerLen = opening[1].length;
  const name = opening[2];

  let nextLine = startLine;
  let autoClosed = false;

  for (;;) {
    nextLine += 1;
    if (nextLine >= endLine) break; // 닫는 줄 없이 문서가 끝나면 그 자리에서 닫는다(관용)

    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
    const lineMax = state.eMarks[nextLine];
    const line = state.src.slice(lineStart, lineMax);

    if (state.sCount[nextLine] - state.blkIndent >= 4) continue;

    const closing = /^(:{3,})[ \t]*$/.exec(line);
    if (closing && closing[1].length >= markerLen) {
      autoClosed = true;
      break;
    }
  }

  const oldParent = state.parentType;
  const oldLineMax = state.lineMax;
  state.parentType = "container";
  // 닫는 줄은 내용에서 제외한다
  state.lineMax = nextLine;

  const openToken = state.push(`container_${name}_open`, "div", 1);
  openToken.markup = ":".repeat(markerLen);
  openToken.block = true;
  openToken.info = name;
  openToken.map = [startLine, nextLine];

  state.md.block.tokenize(state, startLine + 1, nextLine);

  const closeToken = state.push(`container_${name}_close`, "div", -1);
  closeToken.markup = ":".repeat(markerLen);
  closeToken.block = true;

  state.parentType = oldParent;
  state.lineMax = oldLineMax;
  state.line = nextLine + (autoClosed ? 1 : 0);

  return true;
}

/** data-type 속성이 붙은 div를 열고 닫는 렌더러 — TipTap의 parseHTML이 이 속성으로 노드를 복원한다. */
function registerRenderers(md: MarkdownItLike) {
  const open = (dataType: string) => () => `<div data-type="${dataType}">`;
  const close = () => () => `</div>`;
  md.renderer.rules.container_columns_open = open("column-block");
  md.renderer.rules.container_columns_close = close();
  md.renderer.rules.container_column_open = open("column");
  md.renderer.rules.container_column_close = close();
}

/**
 * markdown-it에 컨테이너 규칙을 등록한다. tiptap-markdown은 파싱 때마다 이 setup을 호출하므로
 * 중복 등록되지 않도록 표시를 남긴다(ruler.before는 같은 이름을 두 번 넣으면 예외를 던진다).
 */
const SETUP_FLAG = "__wikiColumnsInstalled";
function setupMarkdownIt(md: MarkdownItLike) {
  const target = md as MarkdownItLike & { [SETUP_FLAG]?: boolean };
  if (target[SETUP_FLAG]) return;
  target[SETUP_FLAG] = true;
  md.block.ruler.before("fence", "wiki_columns", containerRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  registerRenderers(md);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiColumns: {
      /** 현재 위치를 N열 레이아웃으로 감싼다(빈 열들을 만들고 첫 열에 커서를 둔다). */
      setColumns: (count?: number) => ReturnType;
    };
  }
}

/** 바깥 컨테이너 — 열들만 자식으로 갖는다. */
export const ColumnBlock = Node.create({
  name: COLUMN_BLOCK_NAME,
  group: "block",
  content: `${COLUMN_NAME}+`,
  // isolating: 열 경계 밖으로 Backspace/Delete가 새어나가 레이아웃이 통째로 지워지는 것을 막는다
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column-block" }), 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerStateLike, node: ProseMirrorNodeLike) {
          // 바깥은 4개 — 안쪽 열(3개)이 바깥을 먼저 닫지 못하게 한다
          state.write("::::columns");
          state.ensureNewLine();
          // renderContent 대신 직접 순회한다: 블록 사이 기본 구분이 빈 줄 하나(\n\n)라
          // 열마다 사이에 빈 줄이 끼어든다. flushClose(1)로 줄바꿈 하나만 흘려보낸다.
          node.forEach((child, _offset, index) => {
            state.flushClose(1);
            state.render(child, node, index);
          });
          state.flushClose(1);
          state.write("::::");
          state.closeBlock(node);
        },
        parse: { setup: setupMarkdownIt },
      },
    };
  },

  addCommands() {
    return {
      setColumns:
        (count = DEFAULT_COLUMN_COUNT) =>
        ({ commands, editor }) => {
          const columns = Array.from({ length: Math.max(2, count) }, () => ({
            type: COLUMN_NAME,
            content: [{ type: "paragraph" }],
          }));
          // insertContent는 현재 선택을 대체한다 — 빈 문단 위에서 실행하면 그 문단이 레이아웃이 된다
          const inserted = commands.insertContent({ type: COLUMN_BLOCK_NAME, content: columns });
          if (!inserted) return false;
          // 첫 열 안으로 커서를 옮겨 바로 타이핑할 수 있게 한다
          return editor.commands.focus();
        },
    };
  },
});

/** 각 열 — 일반 블록을 자유롭게 담는다. */
export const Column = Node.create({
  name: COLUMN_NAME,
  content: "block+",
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column" }), 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerStateLike, node: ProseMirrorNodeLike) {
          state.write(":::column");
          state.ensureNewLine();
          state.renderContent(node);
          // 열 안의 마지막 블록이 닫히며 예약한 빈 줄을 줄바꿈 하나로 줄인다
          state.flushClose(1);
          state.write(":::");
          state.closeBlock(node);
        },
        parse: { setup: setupMarkdownIt },
      },
    };
  },
});

/** prosemirror-markdown 직렬화 상태 중 이 파일이 쓰는 부분만 — 패키지 타입을 직접 의존하지 않는다. */
interface MarkdownSerializerStateLike {
  write: (text: string) => void;
  ensureNewLine: () => void;
  renderContent: (node: ProseMirrorNodeLike) => void;
  render: (node: ProseMirrorNodeLike, parent: ProseMirrorNodeLike, index: number) => void;
  /** 앞서 닫힌 블록이 예약한 빈 줄을 size줄로 줄여 흘려보낸다(기본 2 = 빈 줄 하나). */
  flushClose: (size?: number) => void;
  closeBlock: (node: ProseMirrorNodeLike) => void;
}

interface ProseMirrorNodeLike {
  forEach: (
    fn: (child: ProseMirrorNodeLike, offset: number, index: number) => void,
  ) => void;
}
