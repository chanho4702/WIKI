import { Node } from "@tiptap/core";
import { formatDateLabel } from "../../lib/dateMention";

export { dateFromHref, formatDateLabel } from "../../lib/dateMention";

/**
 * 날짜 요소 — Confluence의 `//` 날짜 삽입 대응.
 *
 * ## 저장 문법 — `[2026-08-23](date:2026-08-23)` (표준 링크 재사용, 멘션과 같은 원칙)
 *
 * 라벨은 ISO 날짜 그대로 둔다 — 이 문법을 모르는 렌더러에서도 날짜가 그대로 읽힌다.
 * 표시 포맷(한국어 "2026년 8월 23일")은 렌더 단계의 일이며 저장에는 섞지 않는다.
 */
export const DATE_MENTION_NAME = "dateMention";

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
