import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * 글자색·배경색(하이라이트) 마크 — Notion/Confluence의 제한 팔레트 방식.
 *
 * ## 저장 문법 — 텍스트 지시자 (`⚠️ 저장 포맷 재논의` 열린 결정 해소, 2026-08-23)
 *
 * ```
 * :c[중요한 내용]{.red}     ← 글자색
 * :bg[강조할 내용]{.yellow} ← 배경색
 * ```
 *
 * remark-directive의 텍스트 지시자 표준 문법이라 보기 경로는 파서 추가 없이 매핑만 하면 되고,
 * 컨테이너(`:::columns`)·리프(`::toc`)와 같은 지시자 계열이라 문법 체계가 하나로 유지된다.
 * 이 문법을 모르는 렌더러에서는 `:c[내용]{.red}`가 그대로 보인다 — 내용이 사라지지는 않는
 * 열화(컬럼과 같은 트레이드오프). 임의 hex는 받지 않는다 — 팔레트 밖 색은 다크모드·대비
 * 검증이 불가능하다(제한 팔레트가 Notion/Confluence의 선택이기도 하다).
 */

/** 글자색 팔레트 — CSS 클래스 `txt-<이름>`이 라이트/다크 값을 정의한다. */
export const TEXT_COLORS = ["gray", "red", "orange", "green", "blue", "purple"] as const;
/** 배경색 팔레트 — CSS 클래스 `bg-<이름>`. */
export const BG_COLORS = ["yellow", "red", "green", "blue", "purple", "gray"] as const;

export type TextColorName = (typeof TEXT_COLORS)[number];
export type BgColorName = (typeof BG_COLORS)[number];

const TEXT_COLOR_SET = new Set<string>(TEXT_COLORS);
const BG_COLOR_SET = new Set<string>(BG_COLORS);

export function isTextColor(value: string): value is TextColorName {
  return TEXT_COLOR_SET.has(value);
}
export function isBgColor(value: string): value is BgColorName {
  return BG_COLOR_SET.has(value);
}

/* ── markdown-it 인라인 규칙 (편집 경로) ──────────────────────
 * `:name[내용]{.color}` — 내용은 재귀 인라인 파싱해 굵게 등 중첩 마크를 보존한다. */

interface MarkdownItInlineState {
  src: string;
  pos: number;
  posMax: number;
  push: (type: string, tag: string, nesting: number) => { attrs?: [string, string][]; content?: string };
  md: {
    inline: {
      parse: (src: string, md: unknown, env: unknown, tokens: unknown[]) => void;
    };
  };
  env: unknown;
  tokens: unknown[];
}

const OPEN_RE = /^:(c|bg)\[/;

function textDirectiveRule(state: MarkdownItInlineState, silent: boolean): boolean {
  const src = state.src.slice(state.pos);
  const open = OPEN_RE.exec(src);
  if (!open) return false;
  const name = open[1];

  // 대괄호 중첩을 세며 내용의 닫는 `]`를 찾는다 — 내용 안에 [[위키링크]]가 올 수 있다
  let depth = 1;
  let i = open[0].length;
  while (i < src.length && depth > 0) {
    if (src[i] === "[") depth += 1;
    else if (src[i] === "]") depth -= 1;
    i += 1;
  }
  if (depth !== 0) return false;
  const content = src.slice(open[0].length, i - 1);

  const attr = /^\{\.([a-z]+)\}/.exec(src.slice(i));
  if (!attr) return false;
  const color = attr[1];
  const valid = name === "c" ? TEXT_COLOR_SET.has(color) : BG_COLOR_SET.has(color);
  if (!valid) return false;
  if (silent) return true;

  const dataAttr = name === "c" ? "data-text-color" : "data-bg-color";
  // 내용은 **별도 배열**로 재귀 파싱한다 — state.tokens에 직접 파싱하면 나중에 도는 바깥
  // emphasis 델리미터 균형 처리와 토큰 스트림이 엉켜 여는 span이 소실된다(실측: `**:c[..]{.red}**`).
  const children: unknown[] = [];
  state.md.inline.parse(content, state.md, state.env, children);
  const openToken = state.push(`${name}_color_open`, "span", 1);
  openToken.attrs = [[dataAttr, color]];
  for (const child of children) (state.tokens as unknown[]).push(child);
  state.push(`${name}_color_close`, "span", -1);

  state.pos += i + attr[0].length;
  return true;
}

const SETUP_FLAG = "__wikiTextColorsInstalled";
interface MarkdownItLike {
  inline: { ruler: { before: (before: string, name: string, rule: unknown) => void } };
  renderer: { rules: Record<string, unknown> };
}

function setupMarkdownIt(md: MarkdownItLike) {
  const target = md as MarkdownItLike & { [SETUP_FLAG]?: boolean };
  if (target[SETUP_FLAG]) return;
  target[SETUP_FLAG] = true;
  md.inline.ruler.before("link", "wiki_text_colors", textDirectiveRule);
  const open = (attrName: string) => (tokens: Array<{ attrs?: [string, string][] }>, idx: number) => {
    const color = tokens[idx].attrs?.find(([k]) => k === attrName)?.[1] ?? "";
    return `<span ${attrName}="${color}">`;
  };
  md.renderer.rules.c_color_open = open("data-text-color");
  md.renderer.rules.c_color_close = () => "</span>";
  md.renderer.rules.bg_color_open = open("data-bg-color");
  md.renderer.rules.bg_color_close = () => "</span>";
}

/* ── Tiptap 마크 ───────────────────────────────────────────── */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiTextColors: {
      setTextColor: (color: TextColorName) => ReturnType;
      unsetTextColor: () => ReturnType;
      setBgColor: (color: BgColorName) => ReturnType;
      unsetBgColor: () => ReturnType;
    };
  }
}

export const TextColor = Mark.create({
  name: "textColor",

  addAttributes() {
    return {
      color: {
        default: "gray",
        parseHTML: (el) => el.getAttribute("data-text-color") ?? "gray",
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-text-color]" }];
  },

  renderHTML({ mark, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-text-color": mark.attrs.color,
        class: `txt-${mark.attrs.color}`,
      }),
      0,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize: {
          open: () => ":c[",
          close: (_state: unknown, mark: { attrs: { color: string } }) => `]{.${mark.attrs.color}}`,
          mixable: true,
        },
        parse: { setup: setupMarkdownIt },
      },
    };
  },

  addCommands() {
    return {
      setTextColor:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),
      unsetTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

export const BgColor = Mark.create({
  name: "bgColor",

  addAttributes() {
    return {
      color: {
        default: "yellow",
        parseHTML: (el) => el.getAttribute("data-bg-color") ?? "yellow",
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-bg-color]" }];
  },

  renderHTML({ mark, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-bg-color": mark.attrs.color,
        class: `bg-${mark.attrs.color}`,
      }),
      0,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize: {
          open: () => ":bg[",
          close: (_state: unknown, mark: { attrs: { color: string } }) => `]{.${mark.attrs.color}}`,
          mixable: true,
        },
        parse: { setup: setupMarkdownIt },
      },
    };
  },

  addCommands() {
    return {
      setBgColor:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),
      unsetBgColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
