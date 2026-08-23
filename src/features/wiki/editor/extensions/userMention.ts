import { Node } from "@tiptap/core";

/**
 * 사용자 멘션(@) 인라인 원자 노드.
 *
 * ## 저장 문법 — `[@이름](user:id)` (표준 링크 재사용)
 *
 * 멘션은 마크다운 표준에 없다. 전용 문법(`@[user:1]`) 대신 **표준 링크에 `user:` 스킴**을
 * 실어 저장한다 — 직렬화·파싱이 표준 경로 그대로라 왕복 코드가 얇고, 이 문법을 모르는
 * 렌더러에서는 "@이름" 링크로 우아하게 열화된다(이름이 원문에 남는 것이 핵심이다).
 * 이름은 멘션 시점 스냅샷이고 정본은 숫자 id다 — 댓글 authorName과 같은 원칙.
 * W19 IR `mention` 노드와의 대응: attrs.target = user:id, 표시 텍스트 = 이름.
 */
export const USER_MENTION_NAME = "userMention";

/** `user:123` href → "123". 멘션이 아니면 null. */
export function mentionUserIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  return /^user:(\d+)$/.exec(href)?.[1] ?? null;
}

/** 이름의 문법 충돌 문자 제거 — `[`/`]`는 링크 라벨을, 개행은 인라인을 깨뜨린다. */
export function sanitizeMentionName(name: string): string {
  return name.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
}

export const UserMention = Node.create({
  name: USER_MENTION_NAME,
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      userId: { default: "" },
      name: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-user-mention]",
        getAttrs: (el) => ({
          userId: (el as HTMLElement).dataset.userId ?? "",
          name: (el as HTMLElement).dataset.name ?? "",
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "span",
      {
        "data-user-mention": "",
        "data-user-id": node.attrs.userId,
        "data-name": node.attrs.name,
        class: "user-mention",
      },
      `@${node.attrs.name}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.name}`;
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void },
          node: { attrs: { userId: string; name: string } },
        ) {
          state.write(`[@${sanitizeMentionName(node.attrs.name)}](user:${node.attrs.userId})`);
        },
      },
    };
  },
});
