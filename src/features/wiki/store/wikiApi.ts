// wiki-backend 어댑터. 각 태스크에서 REST 구현으로 교체한다. 미구현분은 목업 위임.
// comments는 백엔드에 없어 계속 목업(localStorage) 위임 — 설계 §4-2.
export {
  listComments, addComment, updateComment, deleteComment, __resetForTest,
} from "./wikiMock";

import { sharedApiFetch, sharedApiUpload } from "./apiClient";
import { mapSpace, mapPage, mapPageTree, mapVersionMeta, toBackendId, extractError } from "./mapping";
import {
  ContentSearchError,
  type Attachment,
  type AttachmentUploadOptions,
  type DeletePageOptions,
  type Page,
  type PageStatus,
  type PageType,
  type PageVersion,
  type SearchContentInput,
  type SearchResults,
  type Space,
  type User,
} from "./types";

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
/** 폴더(type)·초안(status)은 백엔드 V2가 받는다 — 목업과 같은 의미론이다. */
export async function createPage(input: { spaceId: string; parentId?: string | null; title: string; body?: string; type?: PageType; status?: PageStatus }): Promise<Page> {
  const res = await sharedApiFetch("/api/wiki/pages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spaceId: toBackendId(input.spaceId),
      parentId: input.parentId ? toBackendId(input.parentId) : null,
      title: input.title.trim(), content: input.body ?? "",
      // 백엔드 V2 계약. 미지정이면 서버가 page/published로 채운다(폴더는 항상 published).
      type: input.type, status: input.status,
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
/** 초안 게시(백엔드 V2). 이미 게시됐으면 서버가 멱등 처리하고 같은 문서를 돌려준다. */
export async function publishPage(id: string): Promise<Page> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/publish`, { method: "POST" });
  return mapPage(await json(res));
}
/**
 * 자식 처리는 서버가 한 트랜잭션에서 수행한다(백엔드 V2 `?children=`).
 * 옵션 없이 자식이 있으면 서버가 409 + "하위 페이지가 있어 삭제할 수 없습니다" — 목업과 같은 계약이다.
 */
export async function deletePage(id: string, options?: DeletePageOptions): Promise<void> {
  const query = options?.children ? `?children=${options.children}` : "";
  await json(await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}${query}`, { method: "DELETE" }));
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

interface AttDto {
  id: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
}
function mapAtt(d: AttDto, pageId: string): Attachment {
  return {
    id: String(d.id),
    pageId,
    filename: d.filename,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    checksumSha256: d.checksumSha256,
  };
}

export async function listAttachments(pageId: string): Promise<Attachment[]> {
  const dtos = await json<AttDto[]>(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/attachments`));
  return dtos.map((d) => mapAtt(d, pageId));
}
export async function uploadAttachment(
  pageId: string,
  file: File,
  options: AttachmentUploadOptions = {},
): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);
  const path = `/api/wiki/pages/${toBackendId(pageId)}/attachments${options.pending ? "?pending=true" : ""}`;
  // 진행률/취소가 필요한 에디터 경로는 XHR, 일반 첨부는 기존 fetch 경로를 유지한다.
  // 둘 다 Content-Type을 직접 지정하지 않아 브라우저가 multipart boundary를 채운다.
  const res = options.onProgress || options.signal
    ? await sharedApiUpload(path, form, options)
    : await sharedApiFetch(path, { method: "POST", body: form });
  return mapAtt(await json(res), pageId);
}
export async function confirmAttachments(pageId: string, attachmentIds: string[]): Promise<void> {
  if (!attachmentIds.length) return;
  await json(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/attachments/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachmentIds: attachmentIds.map(toBackendId) }),
  }));
}
export function attachmentUrl(id: string): string {
  return `${import.meta.env.VITE_API_BASE ?? ""}/api/wiki/attachments/${toBackendId(id)}`;
}
/** 본문에 저장하는 durable 내부 참조. 절대 host·presigned URL을 저장하지 않는다. */
export function inlineAttachmentUrl(id: string): string {
  return `/api/wiki/attachments/${toBackendId(id)}/inline`;
}
export function attachmentIdFromInlineUrl(src: string): string | null {
  return /^\/api\/wiki\/attachments\/(\d+)\/inline$/.exec(src)?.[1] ?? null;
}
/** 메모리 AT를 붙여 받은 뒤 화면이 Blob URL로 변환한다. `<img src>` 직접 호출은 인증되지 않는다. */
export async function fetchInlineAttachment(id: string, signal?: AbortSignal): Promise<Blob> {
  const res = await sharedApiFetch(`/api/wiki/attachments/${toBackendId(id)}/inline`, { signal });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new Error(extractError(res.status, body));
  }
  return res.blob();
}
export async function deleteAttachment(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/wiki/attachments/${toBackendId(id)}`, { method: "DELETE" }));
}

const SEARCH_OPERATION = `
  query WikiSearch($input: SearchInput!) {
    search(input: $input) {
      total
      tookMs
      hits {
        id
        docType
        spaceId
        spaceKey
        spaceName
        pageId
        pageType
        title
        filename
        highlights
        updatedAt
        score
      }
    }
  }
`;

interface GraphQlSearchResponse {
  data?: { search?: SearchResults };
  errors?: Array<{
    extensions?: { code?: string; httpStatus?: number };
  }>;
}

function contentSearchError(status: number, code?: string): ContentSearchError {
  if (status === 429) {
    return new ContentSearchError("검색 요청이 너무 많습니다. 잠시 후 다시 시도하세요.", "rate-limited");
  }
  if (status === 503 || code === "SERVICE_UNAVAILABLE") {
    return new ContentSearchError("검색 서비스를 사용할 수 없습니다. 잠시 후 다시 시도하세요.", "unavailable");
  }
  if (status === 401) {
    return new ContentSearchError("로그인이 만료되었습니다. 다시 로그인하세요.", "unauthorized");
  }
  return new ContentSearchError("검색 결과를 불러올 수 없습니다. 다시 시도하세요.", "unknown");
}

/** Gateway `/api/search/graphql` 계약. HTTP 200 안의 GraphQL errors도 성공으로 삼키지 않는다. */
export async function searchContent(input: SearchContentInput): Promise<SearchResults> {
  const query = input.query.trim();
  if (!query) return { total: 0, tookMs: 0, hits: [] };

  const res = await sharedApiFetch("/api/search/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "WikiSearch",
      query: SEARCH_OPERATION,
      variables: {
        input: {
          query,
          page: input.page ?? 0,
          size: input.size ?? 20,
          ...(input.spaceIds ? { spaceIds: input.spaceIds } : {}),
          ...(input.docTypes ? { docTypes: input.docTypes } : {}),
        },
      },
    }),
  });

  const body = (await res.json().catch(() => ({}))) as GraphQlSearchResponse;
  if (!res.ok) throw contentSearchError(res.status);
  const graphQlError = body.errors?.[0];
  if (graphQlError) {
    throw contentSearchError(
      graphQlError.extensions?.httpStatus ?? 500,
      graphQlError.extensions?.code,
    );
  }
  if (!body.data?.search) throw contentSearchError(500);
  return body.data.search;
}
