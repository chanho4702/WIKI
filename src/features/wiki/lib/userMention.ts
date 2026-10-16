/** `user:123` href → "123". 멘션이 아니면 null. */
export function mentionUserIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  return /^user:(\d+)$/.exec(href)?.[1] ?? null;
}

/** 이름의 문법 충돌 문자 제거 — `[`/`]`는 링크 라벨을, 개행은 인라인을 깨뜨린다. */
export function sanitizeMentionName(name: string): string {
  return name.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
}
