// 조직(org-service) 목업 — 사용자·나·사용자 검색·팀·org 관리 화면용 fetch.
import { CURRENT_USER_ID } from "../../../../mock/users";
import { createOrgMockFetch } from "../orgMockApi";
import type { OrgMe, PersonProfile, Team, TeamMember, User } from "../types";
import { clone, load, nextId, persist } from "./db";

export async function listUsers(): Promise<User[]> {
  return clone(load().users);
}

/** 선택 UI용(W-18) — 백엔드는 디렉터리 장애를 던지지만 목업에는 장애가 없다. */
export async function listSelectableUsers(): Promise<User[]> {
  return clone(load().users);
}

export async function getCurrentUser(): Promise<User> {
  const user = load().users.find((u) => u.id === CURRENT_USER_ID);
  if (!user) throw new Error("현재 사용자를 찾을 수 없습니다");
  return clone(user);
}

/**
 * 조직 서비스가 보는 나(U4). 목업에는 org-service가 없으므로 저장소에 아무것도 없으면
 * **활성 전역 관리자**로 다룬다 — 목업/dev에서도 관리 화면을 열어 볼 수 있어야 한다.
 * 테스트는 `wiki.v1`의 `org.self`로 비관리자·승인 대기를 만든다.
 */
export async function getOrgMe(): Promise<OrgMe> {
  const data = load();
  const self = data.org?.self;
  const user = data.users.find((u) => u.id === CURRENT_USER_ID);
  return {
    id: CURRENT_USER_ID,
    displayName: user?.name ?? `사용자 #${CURRENT_USER_ID}`,
    email: `${CURRENT_USER_ID}@example.com`,
    status: self?.status ?? "ACTIVE",
    globalRoles: self?.globalRoles ?? ["ADMIN"],
  };
}

/**
 * 사람 프로필(F-07) — 백엔드는 `GET /api/org/members/{id}`. 목업 이메일은 getOrgMe와 같은 규칙,
 * 상태는 `org.memberStatus` override(기본 ACTIVE), 팀은 시드 팀 + 만든 팀 중 그 사람이 속한 것.
 */
export async function getPersonProfile(userId: string): Promise<PersonProfile | null> {
  const data = load();
  const user = data.users.find((u) => u.id === userId);
  if (!user) return null;
  const teams = [...SEED_TEAMS, ...(data.teams ?? [])]
    .filter((t) => (data.teamMembers?.[t.id] ?? []).includes(userId))
    .map((t) => ({ ...t }));
  return {
    id: user.id,
    name: user.name,
    email: `${user.id}@example.com`,
    status: data.org?.memberStatus?.[userId] ?? "ACTIVE",
    teams,
  };
}

/** 사용자 검색(U4) — 백엔드는 `GET /api/org/members?q=`(이름·이메일 부분일치). 목업은 이름만 본다. */
export async function searchUsers(q: string): Promise<User[]> {
  const term = q.trim().toLowerCase();
  const users = clone(load().users);
  return term === "" ? users : users.filter((u) => u.name.toLowerCase().includes(term));
}

// ── spaces ───────────────────────────────────────────────────

/** 목업 팀 디렉터리 — org-service teams의 자리. UI(주체 선택)를 검증할 최소 데이터. */
/* ── 팀(W23) — 목업은 시드 두 팀에 더해 만든 팀을 저장한다. 팀원은 사용자 id 목록 ── */
const SEED_TEAMS: Team[] = [
  { id: "t1", name: "플랫폼팀" },
  { id: "t2", name: "디자인팀" },
];

/**
 * `@chanho/org-admin`이 쓰는 인증 fetch의 목업 짝(U4). 패키지는 함수가 아니라 **HTTP 경로**를
 * 부르므로 목업 모드도 같은 경로 계약으로 응답해야 코드 경로가 하나로 유지된다.
 */
export const orgApiFetch = createOrgMockFetch({
  load,
  persist,
  currentUserId: CURRENT_USER_ID,
  seedTeams: SEED_TEAMS,
});

export async function listTeams(): Promise<Team[]> {
  const data = load();
  return [...SEED_TEAMS, ...(data.teams ?? [])].map((t) => ({ ...t }));
}

export async function createTeam(name: string): Promise<Team> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("팀 이름을 입력하세요");
  if ((await listTeams()).some((t) => t.name === trimmed)) throw new Error(`이미 존재하는 팀 이름: ${trimmed}`);
  const data = load();
  const team: Team = { id: nextId(), name: trimmed };
  (data.teams ??= []).push(team);
  persist();
  return { ...team };
}

export async function deleteTeam(teamId: string): Promise<void> {
  const data = load();
  if (SEED_TEAMS.some((t) => t.id === teamId)) throw new Error("기본 팀은 지울 수 없습니다");
  data.teams = (data.teams ?? []).filter((t) => t.id !== teamId);
  if (data.teamMembers) delete data.teamMembers[teamId];
  persist();
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const data = load();
  return (data.teamMembers?.[teamId] ?? []).map((id) => ({
    memberId: id,
    displayName: data.users.find((u) => u.id === id)?.name ?? null,
    role: "MEMBER",
  }));
}

export async function addTeamMember(teamId: string, memberId: string): Promise<void> {
  const data = load();
  data.teamMembers ??= {};
  const set = new Set(data.teamMembers[teamId] ?? []);
  set.add(memberId); // 멱등 — 백엔드와 같다
  data.teamMembers[teamId] = [...set];
  persist();
}

export async function removeTeamMember(teamId: string, memberId: string): Promise<void> {
  const data = load();
  if (!data.teamMembers?.[teamId]) return;
  data.teamMembers[teamId] = data.teamMembers[teamId].filter((id) => id !== memberId);
  persist();
}
