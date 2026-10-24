import type { OrgMemberStatus } from "../store/types";

/** 사람 프로필 화면 경로(F-07) — 라우트 `/people/:userId`와 한 쌍. */
export function personPath(userId: string): string {
  return `/people/${encodeURIComponent(userId)}`;
}

/**
 * 활성 구성원인지 — 아니면(승인 대기·정지·비활성) 프로필은 "비활성"과 문서 목록만 보인다(F-07 AC).
 * 연락처·소속은 지금 그 사람에게 닿는 길이 아니어서 보이지 않는다.
 */
export function isActiveMember(status: OrgMemberStatus): boolean {
  return status === "ACTIVE";
}
