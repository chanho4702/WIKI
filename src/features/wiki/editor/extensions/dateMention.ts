import { Node } from "@tiptap/core";

/**
 * 날짜 요소 — Confluence의 `//` 날짜 삽입 대응.
 *
 * ## 저장 문법 — `[2026-08-23](date:2026-08-23)` (표준 링크 재사용, 멘션과 같은 원칙)
 *
 * 라벨은 ISO 날짜 그대로 둔다 — 이 문법을 모르는 렌더러에서도 날짜가 그대로 읽힌다.
 * 표시 포맷(한국어 "2026년 8월 23일")은 렌더 단계의 일이며 저장에는 섞지 않는다.
 */
export const DATE_MENTION_NAME = "dateMention";

const ISO_DATE_RE = /^date:(\d{4}-\d{2}-\d{2})$/;

/** `date:2026-08-23` href → "2026-08-23". 날짜 요소가 아니면 null. */
export function dateFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  return ISO_DATE_RE.exec(href)?.[1] ?? null;
}

/** ISO → 한국어 표시. 파싱 불가한 값은 원문 그대로(데이터를 숨기지 않는다). */
export function formatDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

export const DateMention = Node.create({
  name: DATE_MENTION_NAME,
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return { date: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-date-mention]",
        getAttrs: (el) => ({ date: (el as HTMLElement).dataset.date ?? "" }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "span",
      { "data-date-mention": "", "data-date": node.attrs.date, class: "date-mention" },
      formatDateLabel(node.attrs.date as string),
    ];
  },

  renderText({ node }) {
    return node.attrs.date as string;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void }, node: { attrs: { date: string } }) {
          state.write(`[${node.attrs.date}](date:${node.attrs.date})`);
        },
      },
    };
  },
});
