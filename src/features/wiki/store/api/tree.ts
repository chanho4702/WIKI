// 지연 트리 조회 — 자식·조상·후손·제목·최근·id 묶음(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { type PageNodeDto, mapPageNode, toBackendId } from "../mapping";
import type { PageNode, PagePath } from "../types";
import { json } from "./http";

async function nodes(path: string): Promise<PageNode[]> {
  const rows = await json<PageNodeDto[]>(await sharedApiFetch(path));
  return rows.map(mapPageNode);
}

export async function listChildren(
  spaceId: string,
  parentId: string | null = null,
): Promise<PageNode[]> {
  const query = parentId === null ? "" : `?parentId=${toBackendId(parentId)}`;
  return nodes(`/api/wiki/spaces/${toBackendId(spaceId)}/pages/children${query}`);
}

export async function listAncestors(pageId: string): Promise<PageNode[]> {
  return nodes(`/api/wiki/pages/${toBackendId(pageId)}/ancestors`);
}

export async function listDescendants(pageId: string): Promise<PageNode[]> {
  return nodes(`/api/wiki/pages/${toBackendId(pageId)}/descendants`);
}

export async function lookupPagesByTitle(spaceId: string, titles: string[]): Promise<PageNode[]> {
  const wanted = titles.map((t) => t.trim()).filter((t) => t.length > 0);
  if (wanted.length === 0) return [];
  const query = wanted.map((t) => `title=${encodeURIComponent(t)}`).join("&");
  return nodes(`/api/wiki/spaces/${toBackendId(spaceId)}/pages/lookup?${query}`);
}

export async function listRecentlyUpdated(spaceId: string, limit = 8): Promise<PageNode[]> {
  return nodes(`/api/wiki/spaces/${toBackendId(spaceId)}/pages/recent?limit=${limit}`);
}

export async function listPagesByIds(spaceId: string, ids: string[]): Promise<PageNode[]> {
  if (ids.length === 0) return [];
  const query = ids.map((id) => `id=${toBackendId(id)}`).join("&");
  return nodes(`/api/wiki/spaces/${toBackendId(spaceId)}/pages/by-ids?${query}`);
}

export async function searchPageTitles(spaceId: string, query: string): Promise<PageNode[]> {
  const q = query.trim();
  if (!q) return [];
  return nodes(`/api/wiki/spaces/${toBackendId(spaceId)}/pages/search?q=${encodeURIComponent(q)}`);
}

/* ── 라벨·백링크(W21-2) ──────────────────────────────────── */

/** 검색 결과가 "어디에 있는 문서인지" 그리려고 여러 페이지의 조상 경로를 한 번에 받는다. */
export async function listPagePaths(pageIds: string[]): Promise<PagePath[]> {
  if (pageIds.length === 0) return [];
  const query = pageIds.map((id) => `id=${toBackendId(id)}`).join("&");
  const rows = await json<Array<{ id: number | string; titles: string[] }>>(
    await sharedApiFetch(`/api/wiki/pages/paths?${query}`));
  return rows.map((row) => ({ id: String(row.id), titles: row.titles ?? [] }));
}
