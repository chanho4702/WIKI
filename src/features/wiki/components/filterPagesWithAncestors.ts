import type { Page } from "../store/types";

/**
 * 제목 부분일치(대소문자 무시) 검색 필터 — 매치된 페이지의 조상 체인을 결과에 포함해
 * 트리 구조(계층 표시)를 보존한다. 빈 검색어면 원본 배열을 그대로 반환한다(원상복귀).
 * 반환 순서는 입력 순서 유지 (스토어의 position 오름차순 그대로 → PageTree가 재구성 가능).
 */
export function filterPagesWithAncestors(pages: Page[], query: string): Page[] {
  const q = query.trim().toLowerCase();
  if (!q) return pages;
  const byId = new Map(pages.map((p) => [p.id, p]));
  const keep = new Set<string>();
  for (const page of pages) {
    if (!page.title.toLowerCase().includes(q)) continue;
    // 매치 + 조상 체인 포함. keep에 이미 있는 id에서 걷기를 멈추므로 순환 데이터에도 안전
    let current: Page | undefined = page;
    while (current !== undefined && !keep.has(current.id)) {
      keep.add(current.id);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
  }
  return pages.filter((p) => keep.has(p.id));
}
