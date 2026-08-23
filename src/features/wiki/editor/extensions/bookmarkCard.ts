import { Node, mergeAttributes } from "@tiptap/core";

/**
 * 링크 미리보기 카드(북마크) — 컨플루언스 링크 붙여넣기의 "카드 표시" 대응.
 *
 * ## 저장 문법 — 리프 지시자 (컨테이너·`::toc`와 같은 계열)
 *
 * ```
 * ::bookmark{url="https://example.com" title="표시 제목"}
 * ```
 *
 * remark-directive의 leafDirective 표준 문법이라 보기 경로는 매핑만 하면 되고(remarkBookmark),
 * 이 문법을 모르는 렌더러에서는 한 줄 텍스트로 열화된다 — URL이 그대로 보이므로 내용 유실이
 * 없다. title에서 `"`는 속성 문법을 깨뜨리므로 저장 시 제거한다.
 */

export const BOOKMARK_NAME = "bookmarkCard";

/** 한 줄 전체가 카드 지시자일 때만 매칭 — 문단 중간의 `::bookmark`는 일반 텍스트로 남긴다. */
const BOOKMARK_LINE_RE = /^::bookmark\{([^}]*)\}\s*$/;
const ATTR_RE = /(\w+)="([^"]*)"/g;

export function sanitizeBookmarkAttr(value: string): string {
  return value.replace(/["{}\n]/g, "").trim();
}

export function parseBookmarkAttrs(raw: string): { url: string; title: string } {
  let url = "";
  let title = "";
  for (const m of raw.matchAll(ATTR_RE)) {
    if (m[1] === "url") url = m[2];
    if (m[1] === "title") title = m[2];
  }
  return { url, title };
}

/* ── markdown-it 블록 규칙 (편집 경로) ─────────────────────── */

interface MarkdownItState {
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  sCount: number[];
  blkIndent: number;
  line: number;
  push: (type: string, tag: string, nesting: number) => { attrs?: [string, string][]; block?: boolean; map?: [number, number] | null };
}

function bookmarkRule(state: MarkdownItState, startLine: number, _endLine: number, silent: boolean) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const m = BOOKMARK_LINE_RE.exec(state.src.slice(start, max));
  if (!m) return false;
  if (silent) return true;

  const { url, title } = parseBookmarkAttrs(m[1]);
  const token = state.push("wiki_bookmark", "div", 0);
  token.block = true;
  token.map = [startLine, startLine + 1];
  token.attrs = [["data-url", url], ["data-title", title]];
  state.line = startLine + 1;
  return true;
}

const ESCAPE_MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeAttr = (value: string) => value.replace(/[&<>"]/g, (ch) => ESCAPE_MAP[ch]);

const SETUP_FLAG = "__wikiBookmarkInstalled";
interface MarkdownItLike {
  block: {
    ruler: {
      before: (
        beforeName: string,
        ruleName: string,
        rule: typeof bookmarkRule,
        options?: { alt?: string[] },
      ) => void;
    };
  };
  renderer: { rules: Record<string, unknown> };
}

function setupMarkdownIt(md: MarkdownItLike) {
  const target = md as MarkdownItLike & { [SETUP_FLAG]?: boolean };
  if (target[SETUP_FLAG]) return;
  target[SETUP_FLAG] = true;
  md.block.ruler.before("paragraph", "wiki_bookmark", bookmarkRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.renderer.rules.wiki_bookmark = (tokens: Array<{ attrs?: [string, string][] }>, idx: number) => {
    const attr = (name: string) => tokens[idx].attrs?.find(([k]) => k === name)?.[1] ?? "";
    return `<div data-type="bookmark" data-url="${escapeAttr(attr("data-url"))}" data-title="${escapeAttr(attr("data-title"))}"></div>`;
  };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiBookmark: {
      /** 현재 위치에 링크 미리보기 카드를 넣는다. */
      setBookmark: (attrs: { url: string; title: string }) => ReturnType;
    };
  }
}

export const BookmarkCard = Node.create({
  name: BOOKMARK_NAME,
  group: "block",
  atom: true,

  addAttributes() {
    return {
      url: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-url") ?? "",
      },
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-title") ?? "",
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="bookmark"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    // NodeView가 실제 표시를 그린다 — 이 출력은 클립보드 직렬화 등 폴백용
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "bookmark",
        "data-url": node.attrs.url,
        "data-title": node.attrs.title,
      }),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "bookmark-card";
      dom.setAttribute("data-type", "bookmark");
      dom.contentEditable = "false";
      const title = document.createElement("span");
      title.className = "bookmark-card-title";
      title.textContent = (node.attrs.title as string) || (node.attrs.url as string);
      const url = document.createElement("span");
      url.className = "bookmark-card-url";
      url.textContent = node.attrs.url as string;
      dom.append(title, url);
      return { dom };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void; closeBlock: (n: unknown) => void },
          node: { attrs: { url: string; title: string } },
        ) {
          const url = sanitizeBookmarkAttr(node.attrs.url);
          const title = sanitizeBookmarkAttr(node.attrs.title);
          state.write(`::bookmark{url="${url}" title="${title}"}`);
          state.closeBlock(node);
        },
        parse: { setup: setupMarkdownIt },
      },
    };
  },

  addCommands() {
    return {
      setBookmark:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: BOOKMARK_NAME, attrs }),
    };
  },
});
