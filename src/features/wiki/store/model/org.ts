// 조직(org-service) — 사용자·팀·페이지 제한·감사 도메인 타입.

export interface User {
  id: string;
  name: string;
}

/**
 * 감사 로그 한 줄.
 *
 * `targetLabel`은 그때 그 이름의 스냅샷이다 — 지워진 대상도 읽혀야 하므로 id로 다시 조회하지
 * 않는다.
 */
export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  detail: string | null;
  actorId: string;
  createdAt: string | null;
}

export type RestrictionPrincipalType = "user" | "team";

export interface RestrictionPrincipal {
  type: RestrictionPrincipalType;
  id: string;
}

/** 조상에서 상속되는 보기 제한 — 다이얼로그의 읽기 전용 표시. */
export interface InheritedRestriction {
  pageId: string;
  pageTitle: string;
  principals: RestrictionPrincipal[];
}

/** 빈 배열 = 해당 타입 제한 없음(모두 허용). */
export interface PageRestrictions {
  view: RestrictionPrincipal[];
  edit: RestrictionPrincipal[];
  inherited: InheritedRestriction[];
}

export interface Team {
  id: string;
  name: string;
}

/* ── 조직(org-service) ─────────────────────────────────────────
 * 설계: platform-backend/docs/superpowers/specs/2026-09-05-user-invite-team-permission-design.md
 * 관리 화면 자체는 `@chanho/org-admin` 패키지가 그린다 — 여기 타입은 위키가 직접 쓰는 것만 둔다. */

export type OrgMemberStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

/**
 * `/api/org/me` — org-service가 보는 나(설계 §3.3).
 *
 * **전역 관리자 판정의 단일 근거다**: `globalRoles`에 `"ADMIN"`이 있으면 관리자. 이 값은
 * org-service의 GLOBAL/ADMIN grant에서 나오며 Keycloak realm role과는 다른 개념이라
 * 토큰의 roles로 대신할 수 없다. `status`가 `PENDING`이면 초대 없이 로그인해 격리된 계정이다.
 */
export interface OrgMe {
  id: string;
  displayName: string;
  email: string | null;
  status: OrgMemberStatus;
  globalRoles: string[];
}

/**
 * 목업 org 상태 — 백엔드 모드에는 대응물이 없다(org-service가 원장).
 * 없으면 "활성 전역 관리자"로 다룬다: 목업/dev에서도 관리 화면을 열 수 있어야 한다.
 */
export interface OrgMockState {
  self?: { status: OrgMemberStatus; globalRoles: string[] };
  /** 사용자별 상태 override(기본 ACTIVE). 승인 대기 목록이 읽는다. */
  memberStatus?: Record<string, OrgMemberStatus>;
  invitations?: OrgMockInvitation[];
  /** 전역 역할 grant — 스페이스 권한(`grants`)과 달리 리소스가 없다. */
  globalGrants?: OrgMockGrant[];
  /** 전역 권한 변경 기록(org-service `GrantAuditResponse` 모양, 오래된 것부터 쌓는다) — 권한 이력 화면용. */
  grantAudit?: OrgMockGrantAudit[];
}

export interface OrgMockGrantAudit {
  id: string;
  action: "GRANT_GRANTED" | "GRANT_CHANGED" | "GRANT_REVOKED";
  targetType: "USER" | "TEAM";
  targetId: string;
  /** 기록 당시 이름 스냅샷 */
  targetLabel: string | null;
  /** 역할 — 변경이면 바뀐 뒤의 역할(서버 `detail`) */
  detail: string;
  actorId: string;
  createdAt: string;
}

export interface OrgMockGrant {
  id: string;
  subjectType: "USER" | "TEAM";
  subjectId: string;
  role: "VIEWER" | "EDITOR" | "ADMIN";
}

export interface OrgMockInvitation {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  message: string | null;
  createdAt: string;
  expiresAt: string;
  /** 서버는 생성·재발송 응답에서만 링크를 준다(토큰은 해시로만 저장) — 목업도 같게 둔다. */
  inviteUrl: string | null;
  mailSent: boolean;
  teams: { teamId: string; role: "LEAD" | "MEMBER" }[];
  grants: { scope: "GLOBAL" | "SPACE" | "PROJECT"; resourceId: string | null; role: "VIEWER" | "EDITOR" | "ADMIN" }[];
}

/**
 * 사람 프로필(F-07) — `GET /api/org/members/{id}`(org-service `MemberDetailResponse`)의 위키 쪽 모양.
 * 이메일·팀은 조직 전원에게 공개한다(사용자 결정). 비활성 구성원이면 화면이 이메일·팀을 빼고
 * "비활성"과 문서 목록만 보인다(F-07 AC). `teams`에는 활성 구성원 전원이 자동으로 속하는 EVERYONE
 * 팀을 넣지 않는다 — 누구에게나 똑같이 붙어 소속을 알려 주지 못한다.
 */
export interface PersonProfile {
  id: string;
  name: string;
  email: string | null;
  status: OrgMemberStatus;
  teams: Team[];
}

/** 팀원 한 줄(W23). 이름은 서버가 함께 준다 — 디렉터리를 다시 뒤지지 않는다. */
export interface TeamMember {
  memberId: string;
  displayName: string | null;
  role: string;
}
