// wiki-backend 어댑터. 각 태스크에서 REST 구현으로 교체한다. 미구현분은 목업 위임.
export {
  listUsers, getCurrentUser, listVersions, restoreVersion,
  listComments, addComment, updateComment, deleteComment, __resetForTest,
} from "./wikiMock";

import { sharedApiFetch } from "./apiClient";
import { mapSpace, mapPage, mapPageTree, toBackendId, extractError } from "./mapping";
import type { Space, Page } from "./types";

/** 백엔드 응답(JSON) 파싱 + 4xx/5xx를 한국어 에러로 변환. 이후 태스크(pages/versions/attachments)도 재사용. */
async function json<T>(res: Response): Promise<T> {
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(extractError(res.status, body));
  return body as T;
}

export async function listSpaces(): Promise<Space[]> {
  const dtos = await json<Parameters<typeof mapSpace>[0][]>(await sharedApiFetch("/api/wiki/spaces"));
  return dtos.map(mapSpace);
}
export async function createSpace(input: { key: string; name: string }): Promise<Space> {
  const res = await sharedApiFetch("/api/wiki/spaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: input.key.trim().toLowerCase(), name: input.name.trim() }),
  });
  return mapSpace(await json(res));
}

export async function listPages(spaceId: string): Promise<Page[]> {
  const rows = await json<Parameters<typeof mapPageTree>[0]>(
    await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/pages`),
  );
  return mapPageTree(rows);
}
export async function getPage(id: string): Promise<Page | null> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`);
  if (res.status === 404) return null;
  return mapPage(await json(res));
}
export async function createPage(input: { spaceId: string; parentId?: string | null; title: string; body?: string }): Promise<Page> {
  const res = await sharedApiFetch("/api/wiki/pages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spaceId: toBackendId(input.spaceId),
      parentId: input.parentId ? toBackendId(input.parentId) : null,
      title: input.title.trim(), content: input.body ?? "",
    }),
  });
  return mapPage(await json(res));
}
export async function updatePage(id: string, patch: { title?: string; body?: string }): Promise<Page> {
  const current = await getPage(id);
  if (!current) throw new Error("페이지를 찾을 수 없습니다");
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: (patch.title ?? current.title).trim(),
      content: patch.body ?? current.body,
      parentId: current.parentId ? toBackendId(current.parentId) : null,
      expectedVersion: current.version,
    }),
  });
  return mapPage(await json(res));
}
export async function deletePage(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`, { method: "DELETE" }));
}
export async function movePage(id: string, target: { parentId: string | null; beforeId?: string | null }): Promise<Page> {
  // 백엔드는 순서(beforeId)를 지원하지 않는다 — parentId만 PUT으로 반영(설계 §4-3).
  const current = await getPage(id);
  if (!current) throw new Error("페이지를 찾을 수 없습니다");
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: current.title, content: current.body,
      parentId: target.parentId ? toBackendId(target.parentId) : null,
      expectedVersion: current.version,
    }),
  });
  return mapPage(await json(res));
}
