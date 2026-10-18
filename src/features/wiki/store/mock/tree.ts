// 지연 트리 조회 목업 — 백엔드와 같은 모양·같은 상한으로만 응답한다.
import type { Page, PageNode, PagePath, WikiData } from "../types";
import { canSeePage, load } from "./db";

/**
 * 목업은 전체 배열을 갖고 있지만, 백엔드와 **같은 모양·같은 상한**으로만 응답한다.
 * 목업이 더 많이 주면 화면이 목업에서만 동작하고 백엔드 모드에서 조용히 깨진다.
 */
const TREE_SEARCH_LIMIT = 50;

const TREE_LOOKUP_LIMIT = 200;

function toNode(data: WikiData, page: Page): PageNode {
  return {
    id: page.id,
    parentId: page.parentId,
    title: page.title,
    type: page.type,
    status: page.status,
    position: page.position,
    icon: page.icon ?? null,
    updatedBy: page.updatedBy,
    updatedAt: page.updatedAt,
    childCount: data.pages.filter((p) => p.parentId === page.id && canSeePage(data, p)).length,
  };
}

/** 직계 자식만(parentId 생략/null = 루트). */
export async function listChildren(
  spaceId: string,
  parentId: string | null = null,
): Promise<PageNode[]> {
  const data = load();
  return data.pages
    // 블로그 글(W24)은 부모가 없어도 트리가 아니다 — 백엔드 findChildren과 같은 제외
    .filter((p) => p.spaceId === spaceId && p.parentId === parentId && !p.archivedAt && p.type !== "blog" && canSeePage(data, p))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((p) => toNode(data, p));
}

/** 루트→부모 순서(자기 자신 제외). 순환 데이터에서도 멈춘다. */
export async function listAncestors(pageId: string): Promise<PageNode[]> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  if (!canSeePage(data, page)) throw new Error("이 페이지를 볼 권한이 없습니다");
  const chain: Page[] = [];
  const visited = new Set([pageId]);
  let cursor = page.parentId;
  while (cursor !== null && !visited.has(cursor)) {
    visited.add(cursor);
    const parent = data.pages.find((p) => p.id === cursor);
    // 볼 수 없는 초안 조상에서 멈춘다 — 그 위를 이어 붙이면 숨은 초안의 존재(와 제목)가 경로로 샌다
    if (!parent || !canSeePage(data, parent)) break;
    chain.unshift(parent);
    cursor = parent.parentId;
  }
  return chain.map((p) => toNode(data, p));
}

/** 후손 전체(자기 자신 제외) — 내보내기·삭제 영향 표시가 쓴다. */
export async function listDescendants(pageId: string): Promise<PageNode[]> {
  const data = load();
  const found: Page[] = [];
  const visited = new Set([pageId]);
  const queue = [pageId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of data.pages.filter((p) => p.parentId === current)) {
      if (visited.has(child.id) || !canSeePage(data, child)) continue;
      visited.add(child.id);
      found.push(child);
      queue.push(child.id);
    }
  }
  return found.map((p) => toNode(data, p));
}

/** 제목 정확 일치 — `[[제목]]` 해석. 렌더러와 같은 기준(trim + 소문자, 같은 스페이스). */
export async function lookupPagesByTitle(spaceId: string, titles: string[]): Promise<PageNode[]> {
  const data = load();
  const wanted = new Set(
    titles
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
      .slice(0, TREE_LOOKUP_LIMIT),
  );
  if (wanted.size === 0) return [];
  return data.pages
    .filter((p) => p.spaceId === spaceId && wanted.has(p.title.trim().toLowerCase()) && canSeePage(data, p))
    .map((p) => toNode(data, p));
}

/** 최근 수정 순 — 스페이스 개요의 "최근 업데이트". 전량을 읽어 정렬하던 것을 대체한다. */
export async function listRecentlyUpdated(spaceId: string, limit = 8): Promise<PageNode[]> {
  const data = load();
  return data.pages
    .filter((p) => p.spaceId === spaceId && !p.archivedAt && canSeePage(data, p))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, Math.min(Math.max(limit, 1), TREE_SEARCH_LIMIT))
    .map((p) => toNode(data, p));
}

/** id 묶음 조회 — 별표 목록처럼 "아는 id들의 현재 제목"이 필요한 곳이 쓴다. */
export async function listPagesByIds(spaceId: string, ids: string[]): Promise<PageNode[]> {
  const data = load();
  const wanted = new Set(ids.slice(0, TREE_LOOKUP_LIMIT));
  return data.pages
    .filter((p) => p.spaceId === spaceId && wanted.has(p.id) && canSeePage(data, p))
    .map((p) => toNode(data, p));
}

/** 제목 부분 일치 — 사이드바 필터와 `[[` 자동완성. */
export async function searchPageTitles(spaceId: string, query: string): Promise<PageNode[]> {
  const data = load();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return data.pages
    .filter((p) => p.spaceId === spaceId && !p.archivedAt && p.title.toLowerCase().includes(q) && canSeePage(data, p))
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
    .slice(0, TREE_SEARCH_LIMIT)
    .map((p) => toNode(data, p));
}

/* ── 라벨·백링크(W21-2) ──────────────────────────────────── */

/** 조상 경로 — 루트부터 부모까지, 자기 자신은 뺀다(백엔드 계약과 같다). */
export async function listPagePaths(pageIds: string[]): Promise<PagePath[]> {
  const data = load();
  const byId = new Map(data.pages.map((p) => [p.id, p]));
  return pageIds.flatMap((id) => {
    if (!byId.has(id)) return [];
    const titles: string[] = [];
    const seen = new Set<string>([id]);
    let cursor = byId.get(id)?.parentId ?? null;
    while (cursor !== null && !seen.has(cursor)) {
      seen.add(cursor);
      const parent = byId.get(cursor);
      if (!parent) break;
      titles.unshift(parent.title);
      cursor = parent.parentId;
    }
    return [{ id, titles }];
  });
}
