// 라벨·백링크(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { type TreeItemDto, mapPageTree, toBackendId } from "../mapping";
import type { LabelCount, Page } from "../types";
import { json } from "./http";

export async function listLabels(pageId: string): Promise<string[]> {
  return json<string[]>(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/labels`));
}

export async function setLabels(pageId: string, labels: string[]): Promise<string[]> {
  return json<string[]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/labels`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels }),
    }),
  );
}

/**
 * 접근 가능한 스페이스 전체의 라벨 후보 — 검색 화면의 라벨 필터 자동완성.
 * 검색 엔진을 타지 않으므로 OpenSearch 배포와 라이트 배포가 같은 답을 낸다.
 */
export async function suggestLabels(query: string): Promise<LabelCount[]> {
  return json<LabelCount[]>(
    await sharedApiFetch(`/api/wiki/labels?q=${encodeURIComponent(query.trim())}`));
}

export async function listSpaceLabels(spaceId: string): Promise<LabelCount[]> {
  return json<LabelCount[]>(
    await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/labels`));
}

export async function listPagesWithLabel(spaceId: string, name: string): Promise<Page[]> {
  const items = await json<TreeItemDto[]>(await sharedApiFetch(
    `/api/wiki/spaces/${toBackendId(spaceId)}/labels/${encodeURIComponent(name)}/pages`));
  return mapPageTree(items);
}

export async function listBacklinks(pageId: string): Promise<Page[]> {
  const items = await json<TreeItemDto[]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/backlinks`));
  return mapPageTree(items);
}

/* ── 휴지통(W21-1) ───────────────────────────────────────── */
