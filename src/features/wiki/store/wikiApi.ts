// wiki-backend 어댑터. 각 태스크에서 REST 구현으로 교체한다. 미구현분은 목업 위임.
// comments는 백엔드에 없어 계속 목업(localStorage) 위임 — 설계 §4-2.
export {
  listComments, addComment, updateComment, deleteComment, __resetForTest,
} from "./wikiMock";

import { sharedApiFetch } from "./apiClient";
import { mapSpace, mapPage, mapPageTree, mapVersionMeta, toBackendId, extractError } from "./mapping";
import type { Space, Page, PageVersion, User, Attachment, PageStatus, PageType, DeletePageOptions } from "./types";

/** 백엔드 응답(JSON) 파싱 + 4xx/5xx를 한국어 에러로 변환. 이후 태스크(pages/versions/attachments)도 재사용. */
async function json<T>(res: Response): Promise<T> {
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(extractError(res.status, body));
  return body as T;
}

export async function getCurrentUser(): Promise<User> {
  const me = await json<{ id: number | string; name?: string; email?: string }>(await sharedApiFetch("/api/me"));
  return { id: String(me.id), name: me.name ?? me.email ?? `사용자 #${me.id}` };
}
export async function listUsers(): Promise<User[]> {
  // 백엔드에 사용자 목록 없음 — org-service users API 연동 전까지 빈 배열(작성자 이름은 폴백 `사용자 #{id}`).
  return [];
}
/** 화면이 updatedBy/authorId(숫자 id)를 이름으로 못 찾을 때 쓰는 폴백. (호출부 후속 배선.) */
export function displayUserName(id: string): string {
  return `사용자 #${id}`;
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
/**
 * 폴더(type)·초안(status)은 목업 선행 기능이다 — 백엔드 계약이 아직 두 필드를 받지 않으므로
 * 요청 본문에 싣지 않고, 응답도 mapPage가 전부 "page"/"published"로 읽는다(기획 P1·P3의
 * "백엔드 컬럼 추가" 대기 항목). 시그니처만 목업과 맞춰 화면이 분기 없이 동작하게 한다.
 */
export async function createPage(input: { spaceId: string; parentId?: string | null; title: string; body?: string; type?: PageType; status?: PageStatus }): Promise<Page> {
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
/**
 * 게시 — 백엔드에 상태 컬럼이 없어 지원할 수 없다. 조용히 성공한 척하면 사용자는 게시된 줄 알고
 * 나가지만 문서는 초안으로 남는다. 명시적으로 거부해 화면이 에러를 노출하게 한다.
 */
export async function publishPage(_id: string): Promise<Page> {
  throw new Error("이 서버는 아직 초안/게시를 지원하지 않습니다");
}
/**
 * 백엔드 DELETE는 자식을 조건 없이 재귀 삭제한다 — 목업의 "옵션 없으면 거부" 계약과 어긋난다.
 * 모드에 따라 지워지는 범위가 달라지면 안 되므로 옵션이 없을 때는 여기서 먼저 막는다.
 * cascade일 때만 백엔드의 재귀 삭제에 그대로 맡긴다(추가 왕복 없음).
 */
export async function deletePage(id: string, options?: DeletePageOptions): Promise<void> {
  if (options?.children !== "cascade") {
    const page = await getPage(id);
    if (!page) throw new Error("페이지를 찾을 수 없습니다");
    const children = (await listPages(page.spaceId)).filter((p) => p.parentId === id);
    if (children.length > 0) {
      if (!options?.children) throw new Error("하위 페이지가 있어 삭제할 수 없습니다");
      // promote: 백엔드에 원자적 연산이 없어 자식을 하나씩 옮긴 뒤 대상을 지운다.
      // 중간에 실패하면 이미 옮겨진 자식은 옮겨진 채로 남고 대상은 남는다 — 재시도하면 이어서 진행된다.
      for (const child of children) {
        await movePage(child.id, { parentId: page.parentId });
      }
    }
  }
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

export async function listVersions(pageId: string): Promise<PageVersion[]> {
  const metas = await json<Parameters<typeof mapVersionMeta>[0][]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/revisions`),
  );
  return metas.map((m) => mapVersionMeta(m, pageId)); // 백엔드가 최신순 보장
}
export async function restoreVersion(pageId: string, versionId: string): Promise<Page> {
  // versionId는 어댑터가 만든 `${pageId}:${version}` — 버전 번호를 추출해 restore 엔드포인트 호출.
  const version = Number(versionId.split(":")[1]);
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/revisions/${version}/restore`, { method: "POST" });
  return mapPage(await json(res));
}

interface AttDto { id: number; filename: string; contentType: string; sizeBytes: number }
function mapAtt(d: AttDto, pageId: string): Attachment {
  return { id: String(d.id), pageId, filename: d.filename, contentType: d.contentType, sizeBytes: d.sizeBytes };
}

export async function listAttachments(pageId: string): Promise<Attachment[]> {
  const dtos = await json<AttDto[]>(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/attachments`));
  return dtos.map((d) => mapAtt(d, pageId));
}
export async function uploadAttachment(pageId: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);
  // Content-Type 헤더를 직접 지정하지 않는다 — 브라우저가 multipart boundary를 채워야 한다.
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/attachments`, { method: "POST", body: form });
  return mapAtt(await json(res), pageId);
}
export function attachmentUrl(id: string): string {
  return `${import.meta.env.VITE_API_BASE ?? ""}/api/wiki/attachments/${toBackendId(id)}`;
}
export async function deleteAttachment(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/wiki/attachments/${toBackendId(id)}`, { method: "DELETE" }));
}
