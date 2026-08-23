import type { CollaborationConnectionStatus } from "./session";

/**
 * 로컬 Y.Doc이 열려 있으면 단절 중에도 편집은 계속할 수 있지만, 서버가 최신 update를 받기 전에
 * publish하면 PostgreSQL projection이 뒤처질 수 있다. 명시적 저장/게시만큼은 sync 확인 뒤 허용한다.
 */
export function canCommitCollaborationDraft(
  status: CollaborationConnectionStatus,
  hasBinding: boolean,
  generation: number | null,
): boolean {
  return status === "synced" && hasBinding && generation !== null;
}
