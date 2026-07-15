import type { Page } from "../store/types";

/** 코드 펜스(```)와 인라인 코드(`)를 분리해 코드 밖에서만 치환하기 위한 분할 패턴 */
const CODE_SPLIT = /(```[\s\S]*?```|`[^`\n]*`)/;
const WIKI_LINK = /\[\[([^[\]\n]+)\]\]/g;

/**
 * [[제목]] → 마크다운 링크 치환.
 * 같은 스페이스에서 제목 정확 일치(대소문자·양끝 공백 무시, 중복이면 첫 페이지).
 * 없는 제목은 생성 화면 경로(new?title=) — MarkdownView가 danger 스타일을 입힌다.
 */
export function resolveWikiLinks(markdown: string, pages: Page[], spaceId: string): string {
  const byTitle = new Map<string, Page>();
  for (const page of pages) {
    const key = page.title.trim().toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, page);
  }
  return markdown
    .split(CODE_SPLIT)
    .map((segment, index) => {
      if (index % 2 === 1) return segment; // 홀수 인덱스 = 코드 구간
      return segment.replace(WIKI_LINK, (_match, raw: string) => {
        const title = raw.trim();
        const target = byTitle.get(title.toLowerCase());
        return target
          ? `[${title}](/spaces/${spaceId}/pages/${target.id})`
          : `[${title}](/spaces/${spaceId}/pages/new?title=${encodeURIComponent(title)})`;
      });
    })
    .join("");
}
