// 공동 편집 티켓·초안 확정·부트스트랩(백엔드 어댑터).
import { sharedApiFetch, sharedCollaborationFetch } from "../apiClient";
import { mapPage, toBackendId } from "../mapping";
import {
  type CollaborationBootstrap,
  type CollaborationDraftCommit,
  type CollaborationDraftCommitOptions,
  CollaborationDraftResetError,
  type CollaborationTicket,
  PageConflictError,
} from "../types";
import { json } from "./http";
import { getPage } from "./pages";

/** Yjs projection과 page revision, collaboration generation을 서버의 단일 transaction으로 확정한다. */
export async function commitCollaborationDraft(
  id: string,
  patch: { title: string; body: string },
  options: CollaborationDraftCommitOptions,
): Promise<CollaborationDraftCommit> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/collaboration-draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: patch.title.trim(),
      content: patch.body,
      expectedPageVersion: options.expectedVersion,
      expectedGeneration: options.expectedGeneration,
    }),
  });
  if (res.status === 409) {
    const serverPage = await getPage(id).catch(() => null);
    throw new PageConflictError(serverPage);
  }
  const response = await json<{
    page: Parameters<typeof mapPage>[0];
    generation: number;
  }>(res);
  if (!response.page || !Number.isSafeInteger(response.generation) || response.generation <= 0) {
    throw new Error("공동 초안 저장 결과를 확인할 수 없습니다");
  }
  return { page: mapPage(response.page), generation: response.generation };
}

/** Access Token 대신 WebSocket 인증 메시지에만 실을 1회용 ticket을 발급받는다. */
export async function requestCollaborationTicket(pageId: string): Promise<CollaborationTicket> {
  const response = await json<CollaborationTicket>(await sharedApiFetch(
    `/api/wiki/pages/${toBackendId(pageId)}/collaboration-ticket`,
    { method: "POST", cache: "no-store" },
  ));
  if (
    typeof response.ticket !== "string"
    || typeof response.room !== "string"
    || typeof response.websocketPath !== "string"
    || typeof response.expiresAt !== "string"
    || (response.pageVersion !== undefined
      && (!Number.isSafeInteger(response.pageVersion) || response.pageVersion <= 0))
    || (response.draftEpoch !== undefined
      && (!Number.isSafeInteger(response.draftEpoch) || response.draftEpoch < 0))
  ) {
    throw new Error("공동 편집 연결 정보를 확인할 수 없습니다");
  }
  return response;
}

/** 기존 page revision을 shared Y.Doc에 최초 한 번만 넣는다. ticket은 이 요청에서 소비된다. */
export async function bootstrapCollaborationDocument(
  pageId: string,
  basePageVersion: number,
  ticket: string,
  state: Uint8Array,
): Promise<CollaborationBootstrap> {
  const res = await sharedCollaborationFetch(
    `/api/wiki/collaboration/pages/${toBackendId(pageId)}/bootstrap`,
    ticket,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Wiki-Page-Version": String(basePageVersion),
      },
      body: state as BodyInit,
    },
  );
  // 409 = 이 탭의 페이지 버전이 티켓 발급 시점의 버전과 다르다(옛 페이지를 들고 있다).
  if (res.status === 409) {
    const body: unknown = await res.json().catch(() => null);
    const message = body && typeof body === "object"
      && typeof (body as { error?: unknown }).error === "string"
      && (body as { error: string }).error.trim()
      ? (body as { error: string }).error
      : undefined;
    throw new CollaborationDraftResetError(message);
  }
  const response = await json<CollaborationBootstrap>(res);
  if (
    typeof response.created !== "boolean"
    || !Number.isSafeInteger(response.basePageVersion)
    || response.basePageVersion <= 0
    || !Number.isSafeInteger(response.generation)
    || response.generation <= 0
  ) {
    throw new Error("공동 편집 문서 정보를 확인할 수 없습니다");
  }
  return response;
}
