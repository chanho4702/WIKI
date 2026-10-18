// 조직(org-service) — 사용자 디렉터리·나·사용자 검색·팀(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { toBackendId } from "../mapping";
import type { OrgMe, OrgMemberStatus, Team, TeamMember, User } from "../types";
import { json } from "./http";

export async function getCurrentUser(): Promise<User> {
  const me = await json<{ id: number | string; name?: string; email?: string }>(await sharedApiFetch("/api/me"));
  return { id: String(me.id), name: me.name ?? me.email ?? `사용자 #${me.id}` };
}

/**
 * 조직 멤버 디렉터리 공유 캐시(W-12) — `/api/org/members`는 조직 전량이고 페이지 나눔이 없다. 화면마다
 * (보기·알림 벨·홈·검색…) 따로 받으면 문서 하나 여는 데 같은 전량 응답을 두세 번 받는다. 진행 중 요청을
 * 합치고 TTL 동안 재사용한다. 실패는 캐시하지 않는다 — 장애가 풀리면 다음 호출이 바로 성공해야 한다.
 */
const USER_DIRECTORY_TTL_MS = 5 * 60_000;

let userDirectory: { fetchedAt: number; rows: Promise<User[]> } | null = null;

function loadUserDirectory(): Promise<User[]> {
  const now = Date.now();
  if (userDirectory && now - userDirectory.fetchedAt < USER_DIRECTORY_TTL_MS) return userDirectory.rows;
  const rows = (async () => {
    const members = await json<{ id: number; displayName: string; email?: string | null; status: string }[]>(
      await sharedApiFetch("/api/org/members"),
    );
    // ACTIVE만 노출한다(비활성 계정은 멘션·선택 UI에 나오면 안 된다).
    return members
      .filter((m) => m.status === "ACTIVE")
      .map((m) => ({ id: String(m.id), name: m.displayName }));
  })();
  const entry = { fetchedAt: now, rows };
  userDirectory = entry;
  rows.catch(() => {
    if (userDirectory === entry) userDirectory = null;
  });
  return rows;
}

/** 테스트 전용 — 디렉터리 캐시를 비운다. */
export function __resetUserDirectoryForTest(): void {
  userDirectory = null;
}

/**
 * org-service 사용자 디렉터리 — **이름 표시용**. 디렉터리 장애가 화면 전체를 죽이면 안 되므로 실패는
 * 빈 목록이다(이름은 authorName 스냅샷/`사용자 #id` 폴백이 대신한다). 고르는 UI는 listSelectableUsers.
 */
export async function listUsers(): Promise<User[]> {
  try {
    return (await loadUserDirectory()).map((u) => ({ ...u }));
  } catch {
    return [];
  }
}

/**
 * 같은 디렉터리의 **선택 UI용**(W-18) — 실패를 삼키지 않는다. 사람·팀을 고르는 화면이 장애를 빈 목록으로
 * 받으면 "고를 사람이 없다"로 보여 잘못된 저장(제한을 엉뚱한 주체로)을 부른다.
 */
export async function listSelectableUsers(): Promise<User[]> {
  return (await loadUserDirectory()).map((u) => ({ ...u }));
}

/**
 * 조직 서비스가 보는 나(U4, 설계 §3.3). **전역 관리자 판정의 단일 근거**다 —
 * 전에는 관리자 전용 엔드포인트를 찔러 성공 여부로 판단했는데, 그러면 그 엔드포인트의
 * 장애가 "관리자가 아님"으로 둔갑했다. 실패는 그대로 던진다(호출부가 비관리자로 접는다).
 */
export async function getOrgMe(): Promise<OrgMe> {
  const me = await json<{
    id: number | string;
    displayName?: string;
    email?: string | null;
    status?: string;
    globalRoles?: string[];
  }>(await sharedApiFetch("/api/org/me"));
  return {
    id: String(me.id),
    displayName: me.displayName ?? me.email ?? `사용자 #${me.id}`,
    email: me.email ?? null,
    status: (me.status as OrgMemberStatus | undefined) ?? "ACTIVE",
    globalRoles: me.globalRoles ?? [],
  };
}

/**
 * 사용자 검색(U4) — 서버가 이름·이메일 부분일치로 거른다(기본 필터 `status=ACTIVE&kind=HUMAN`).
 * `listUsers`와 달리 실패를 삼키지 않는다: 검색 결과가 비는 것과 검색이 안 되는 것은 다르다.
 */
export async function searchUsers(q: string): Promise<User[]> {
  const rows = await json<{ id: number; displayName: string }[]>(
    await sharedApiFetch(`/api/org/members?q=${encodeURIComponent(q.trim())}`),
  );
  return rows.map((m) => ({ id: String(m.id), name: m.displayName }));
}

/**
 * `@chanho/org-admin`이 쓰는 인증 fetch(U4). 패키지는 `/api/org/...` 상대 경로만 넘기고
 * 토큰·게이트웨이 경로는 이 어댑터가 붙인다 — 스토어의 다른 호출과 같은 통로다.
 */
export const orgApiFetch = sharedApiFetch;

/** 화면이 updatedBy/authorId(숫자 id)를 이름으로 못 찾을 때 쓰는 폴백. (호출부 후속 배선.) */
export function displayUserName(id: string): string {
  return `사용자 #${id}`;
}

// ── comments ─────────────────────────────────────────────────
// 서버 영속(P0-004) — 규칙은 목업과 동일: 1단 답글, 작성자만 수정/삭제(+스페이스 ADMIN
// moderation), 최상위 삭제 시 답글 연쇄, 무변경 수정은 "(수정됨)"을 남기지 않는다.

/**
 * org 팀 목록 — 제한 다이얼로그·스페이스 권한의 TEAM 주체 선택용. 선택 UI라 장애를 빈 목록으로 삼키지
 * 않는다(W-18) — "팀 없음"으로 보이면 관리자가 제한을 사람 단위로 잘못 저장한다.
 */
export async function listTeams(): Promise<Team[]> {
  const rows = await json<Array<{ id: number; name: string }>>(await sharedApiFetch("/api/org/teams"));
  return rows.map((t) => ({ id: String(t.id), name: t.name }));
}

/* ── 스페이스 권한(W22) — org-service grant REST ─────────── */

/* ── 팀 관리(W23) — org-service. 쓰기는 GLOBAL ADMIN, 서버가 403으로 거절한다 ── */
export async function createTeam(name: string): Promise<Team> {
  const t = await json<{ id: number; name: string }>(await sharedApiFetch("/api/org/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }));
  return { id: String(t.id), name: t.name };
}

export async function deleteTeam(teamId: string): Promise<void> {
  await sharedApiFetch(`/api/org/teams/${encodeURIComponent(teamId)}`, { method: "DELETE" });
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const rows = await json<Array<{ memberId: number; displayName: string | null; role: string }>>(
    await sharedApiFetch(`/api/org/teams/${encodeURIComponent(teamId)}/members`));
  return rows.map((r) => ({ memberId: String(r.memberId), displayName: r.displayName, role: r.role }));
}

export async function addTeamMember(teamId: string, memberId: string): Promise<void> {
  await sharedApiFetch(
    `/api/org/teams/${encodeURIComponent(teamId)}/members/${toBackendId(memberId)}`, { method: "PUT" });
}

export async function removeTeamMember(teamId: string, memberId: string): Promise<void> {
  await sharedApiFetch(
    `/api/org/teams/${encodeURIComponent(teamId)}/members/${toBackendId(memberId)}`, { method: "DELETE" });
}
