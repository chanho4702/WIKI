// 감사 로그·검색 색인 관리(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { toBackendId } from "../mapping";
import type { AuditEntry, ReindexJob, SearchIndexStatus } from "../types";
import { json } from "./http";

/** 스페이스 삭제 기록(V30) — 전역 관리자만. 아니면 403이 그대로 올라온다. */
export async function listSpaceDeletions(): Promise<AuditEntry[]> {
  const rows = await json<Array<{
    id: number | string; action: string; targetType: string; targetId: number | string | null;
    targetLabel: string; detail: string | null; actorId: number | string; createdAt: string | null;
  }>>(await sharedApiFetch("/api/wiki/audit/space-deletions"));
  return rows.map((r) => ({
    ...r, id: String(r.id), targetId: r.targetId === null ? null : String(r.targetId), actorId: String(r.actorId),
  }));
}

/** 스페이스 감사 로그(W23) — 스페이스 ADMIN만. 아니면 403이 그대로 올라온다. */
export async function listAudit(spaceId: string): Promise<AuditEntry[]> {
  const rows = await json<Array<{
    id: number | string;
    action: string;
    targetType: string;
    targetId: number | string | null;
    targetLabel: string;
    detail: string | null;
    actorId: number | string;
    createdAt: string | null;
  }>>(await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/audit`));
  return rows.map((r) => ({
    ...r,
    id: String(r.id),
    targetId: r.targetId === null ? null : String(r.targetId),
    actorId: String(r.actorId),
  }));
}

/**
 * 스페이스 권한 변경 이력(org-service).
 *
 * 위키 감사와 **같은 모양**으로 온다 — 화면이 두 기록을 한 목록으로 합치기 때문이다.
 * 권한이 없으면 403이 그대로 올라온다(위키 감사와 같은 취급).
 */
export async function listGrantAudit(spaceId: string): Promise<AuditEntry[]> {
  return json<AuditEntry[]>(await sharedApiFetch(
    `/api/org/grants/audit?resourceType=SPACE&resourceId=${encodeURIComponent(spaceId)}`));
}

/**
 * 색인 현황. **전역 관리자 여부를 확인하는 창구이기도 하다** — 아니면 403이 오고, 화면은
 * 관리 메뉴 자체를 감춘다. 그래서 403을 오류가 아니라 "권한 없음"으로 구분해 돌려준다.
 */
export async function getSearchIndexStatus(): Promise<SearchIndexStatus | null> {
  const res = await sharedApiFetch("/api/search/admin/reindex/status");
  if (res.status === 403) return null;
  return json<SearchIndexStatus>(res);
}

export async function startReindex(): Promise<ReindexJob> {
  return json<ReindexJob>(
    await sharedApiFetch("/api/search/admin/reindex", { method: "POST" }));
}

export async function getReindexJob(jobId: string): Promise<ReindexJob> {
  return json<ReindexJob>(
    await sharedApiFetch(`/api/search/admin/reindex/${encodeURIComponent(jobId)}`));
}
