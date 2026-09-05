// src/features/wiki/store/orgMockApi.ts
// 목업 모드의 `/api/org/*` — `@chanho/org-admin`이 호스트에게 받는 인증 fetch의 목업 짝이다.
//
// 패키지는 fetch 한 개만 알고(경로·응답 shape가 계약), 위키는 목업 모드에서 그 계약을 그대로
// 흉내 낸다. 화면을 위해 스토어 함수를 따로 만들지 않는 이유: 패키지가 부르는 것은 함수가
// 아니라 **HTTP 경로**라 여기서 갈라야 백엔드 모드와 코드 경로가 하나로 유지된다.
//
// 목업이 백엔드보다 관대하면 화면이 목업에서만 동작한다 — 없는 것은 없는 대로(빈 목록·404)
// 돌려주고, 오류 본문도 공용 계약 `{"error": 메시지}`를 쓴다.
import type {
  OrgMemberStatus,
  OrgMockGrant,
  OrgMockInvitation,
  SpaceGrant,
  Team,
  WikiData,
} from "./types";

export interface OrgMockDeps {
  load: () => WikiData;
  persist: () => void;
  currentUserId: string;
  /** 저장소에 없는 기본 팀 — wikiMock의 목록과 같은 것을 봐야 한다. */
  seedTeams: Team[];
}

const JSON_HEADERS = { "Content-Type": "application/json" };
/** 목업 사용자는 이메일이 없다(User는 id·name뿐) — 화면이 "-"만 늘어놓지 않게 규칙으로 만든다. */
const emailOf = (id: string) => `${id}@example.com`;
const CREATED_AT = "2026-07-10T09:00:00.000Z";

function ok(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function fail(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });
}

/** 스페이스 권한의 `commenter`는 org REST 역할에 없다 — 표시용으로 VIEWER로 접는다. */
function upperRole(role: SpaceGrant["role"]): OrgMockGrant["role"] {
  return role === "admin" ? "ADMIN" : role === "editor" ? "EDITOR" : "VIEWER";
}

function lowerRole(role: string): SpaceGrant["role"] {
  return role === "ADMIN" ? "admin" : role === "EDITOR" ? "editor" : "viewer";
}

export function createOrgMockFetch(deps: OrgMockDeps) {
  const { load, persist, currentUserId, seedTeams } = deps;

  const org = () => {
    const data = load();
    return (data.org ??= {});
  };

  const statusOf = (id: string): OrgMemberStatus =>
    (id === currentUserId ? org().self?.status : undefined) ?? org().memberStatus?.[id] ?? "ACTIVE";

  const memberOf = (id: string) => {
    const user = load().users.find((u) => u.id === id);
    if (!user) return null;
    return {
      id: user.id,
      displayName: user.name,
      email: emailOf(user.id),
      status: statusOf(user.id),
      kind: "HUMAN",
      joinedVia: "LEGACY",
      createdAt: CREATED_AT,
    };
  };

  const allMembers = () => load().users.map((u) => memberOf(u.id)!);

  const teamsOf = (memberId: string) => {
    const data = load();
    const all = [...seedTeams, ...(data.teams ?? [])];
    return all
      .filter((t) => (data.teamMembers?.[t.id] ?? []).includes(memberId))
      .map((t) => ({ id: t.id, name: t.name, role: "MEMBER" }));
  };

  const teamRow = (team: Team) => ({
    id: team.id,
    name: team.name,
    description: null,
    kind: "STANDARD",
    memberCount: (load().teamMembers?.[team.id] ?? []).length,
    myRole: null,
  });

  const subjectName = (type: string, id: string) => {
    const data = load();
    return type === "TEAM"
      ? ([...seedTeams, ...(data.teams ?? [])].find((t) => t.id === id)?.name ?? null)
      : (data.users.find((u) => u.id === id)?.name ?? null);
  };

  const grantRow = (
    g: { id: string; subjectType: string; subjectId: string; role: string },
    scope: string,
    resourceId: string | null,
  ) => ({
    id: g.id,
    subjectType: g.subjectType,
    subjectId: g.subjectId,
    subjectName: subjectName(g.subjectType, g.subjectId),
    scope,
    resourceId,
    role: g.role,
  });

  /** 이 사람에게 걸린 모든 grant — 전역 + 스페이스. 사용자 상세의 "권한" 탭이 읽는다. */
  const grantsFor = (memberId: string) => {
    const data = load();
    const rows = (org().globalGrants ?? [])
      .filter((g) => g.subjectType === "USER" && g.subjectId === memberId)
      .map((g) => grantRow(g, "GLOBAL", null));
    for (const [spaceId, list] of Object.entries(data.grants ?? {})) {
      for (const g of list) {
        if (g.subjectType !== "user" || g.subjectId !== memberId) continue;
        rows.push(
          grantRow(
            { id: g.id, subjectType: "USER", subjectId: g.subjectId, role: upperRole(g.role) },
            "SPACE",
            spaceId,
          ),
        );
      }
    }
    return rows;
  };

  const matches = (member: { displayName: string; email: string }, q: string) =>
    q === "" ||
    member.displayName.toLowerCase().includes(q) ||
    member.email.toLowerCase().includes(q);

  function filteredMembers(params: URLSearchParams) {
    const q = (params.get("q") ?? "").trim().toLowerCase();
    // 서버 기본값과 같다(설계 §3.3): 지정이 없으면 활성 사람만, `ALL`이면 전부.
    const status = params.get("status") ?? "ACTIVE";
    const kind = params.get("kind") ?? "HUMAN";
    return allMembers().filter(
      (m) =>
        (status === "ALL" || m.status === status) &&
        (kind === "ALL" || m.kind === kind) &&
        matches(m, q),
    );
  }

  function invitationRow(inv: OrgMockInvitation) {
    return {
      ...inv,
      invitedByName: load().users.find((u) => u.id === currentUserId)?.name ?? null,
      acceptedAt: null,
    };
  }

  function newId(): string {
    return crypto.randomUUID();
  }

  /* eslint-disable-next-line complexity -- 라우팅 테이블이라 분기가 곧 계약이다 */
  async function handle(path: string, init: RequestInit | undefined): Promise<Response> {
    const url = new URL(path, "http://mock.local");
    const segments = url.pathname.replace(/^\/api\/org\/?/, "").split("/").filter(Boolean);
    const method = (init?.method ?? "GET").toUpperCase();
    const body: Record<string, unknown> =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const params = url.searchParams;
    const data = load();

    const [head, a, b, c] = segments;

    if (head === "me" && method === "GET") {
      const me = memberOf(currentUserId);
      return ok({
        ...(me ?? { id: currentUserId, displayName: "사용자", email: null, kind: "HUMAN", joinedVia: "LEGACY", createdAt: CREATED_AT }),
        status: statusOf(currentUserId),
        globalRoles: org().self?.globalRoles ?? ["ADMIN"],
        teams: teamsOf(currentUserId),
      });
    }

    if (head === "members") {
      if (method === "GET" && a === undefined) return ok(filteredMembers(params));
      if (method === "GET" && a === "page") {
        const size = Number(params.get("size") ?? 20);
        const page = Number(params.get("page") ?? 0);
        const rows = filteredMembers(params);
        return ok({ items: rows.slice(page * size, page * size + size), page, size, total: rows.length });
      }
      if (method === "GET" && a === "pending") {
        return ok(allMembers().filter((m) => m.status === "PENDING"));
      }
      if (a !== undefined && b === "events" && method === "GET") {
        // 목업에는 member_event 원장이 없다 — 화면은 빈 이력을 그대로 보여준다.
        return ok([]);
      }
      if (a !== undefined && b === "approve" && method === "POST") {
        if (!memberOf(a)) return fail("사용자를 찾을 수 없습니다", 404);
        (org().memberStatus ??= {})[a] = "ACTIVE";
        persist();
        return ok(null, 204);
      }
      if (a !== undefined && b === undefined && method === "GET") {
        const member = memberOf(a);
        if (!member) return fail("사용자를 찾을 수 없습니다", 404);
        return ok({ ...member, teams: teamsOf(a), grants: grantsFor(a) });
      }
      if (a !== undefined && b === undefined && method === "PATCH") {
        const status = body.status;
        if (typeof status !== "string") return fail("변경할 상태를 지정하세요", 400);
        if (a === currentUserId && status === "DEACTIVATED") return fail("자기 계정은 비활성할 수 없습니다", 400);
        (org().memberStatus ??= {})[a] = status as OrgMemberStatus;
        persist();
        return ok(null, 204);
      }
    }

    if (head === "invitations") {
      const list = (org().invitations ??= []);
      if (method === "GET" && a === undefined) {
        const status = params.get("status") ?? "";
        const q = (params.get("q") ?? "").trim().toLowerCase();
        const size = Number(params.get("size") ?? 20);
        const page = Number(params.get("page") ?? 0);
        const rows = list
          .filter((i) => (status === "" || i.status === status) && (q === "" || i.email.toLowerCase().includes(q)))
          // 목록은 링크를 되살릴 수 없다(서버는 토큰 해시만 저장) — 재발송이 새 링크를 준다.
          .map((i) => invitationRow({ ...i, inviteUrl: null }));
        return ok({ items: rows.slice(page * size, page * size + size), page, size, total: rows.length });
      }
      if (method === "POST" && a === undefined) {
        const emails = Array.isArray(body.emails) ? (body.emails as string[]) : [];
        if (emails.length === 0) return fail("초대할 이메일을 입력하세요", 400);
        const created = emails.map((email) => {
          const inv: OrgMockInvitation = {
            id: newId(),
            email,
            status: "PENDING",
            message: typeof body.message === "string" && body.message !== "" ? body.message : null,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
            inviteUrl: `/invite/${newId()}`,
            // SMTP가 없는 기본 구성과 같다 — 화면이 링크 복사를 안내한다.
            mailSent: false,
            teams: (body.teams as OrgMockInvitation["teams"]) ?? [],
            grants: (body.grants as OrgMockInvitation["grants"]) ?? [],
          };
          list.push(inv);
          return invitationRow(inv);
        });
        persist();
        return ok(created, 201);
      }
      if (method === "POST" && a !== undefined && b === "resend") {
        const inv = list.find((i) => i.id === a);
        if (!inv) return fail("초대를 찾을 수 없습니다", 404);
        inv.inviteUrl = `/invite/${newId()}`;
        inv.expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
        persist();
        return ok(invitationRow(inv));
      }
      if (method === "DELETE" && a !== undefined) {
        const inv = list.find((i) => i.id === a);
        if (!inv) return fail("초대를 찾을 수 없습니다", 404);
        inv.status = "REVOKED";
        persist();
        return ok(null, 204);
      }
    }

    if (head === "teams") {
      const all = () => [...seedTeams, ...(data.teams ?? [])];
      if (method === "GET" && a === undefined) {
        const q = (params.get("q") ?? "").trim().toLowerCase();
        return ok(all().filter((t) => q === "" || t.name.toLowerCase().includes(q)).map(teamRow));
      }
      if (method === "POST" && a === undefined) {
        const name = String(body.name ?? "").trim();
        if (!name) return fail("팀 이름을 입력하세요", 400);
        if (all().some((t) => t.name === name)) return fail(`이미 존재하는 팀 이름: ${name}`, 409);
        const team: Team = { id: newId(), name };
        (data.teams ??= []).push(team);
        persist();
        return ok(teamRow(team), 201);
      }
      if (a !== undefined && b === undefined && method === "PUT") {
        const name = String(body.name ?? "").trim();
        if (!name) return fail("팀 이름을 입력하세요", 400);
        const team = all().find((t) => t.id === a);
        if (!team) return fail("팀을 찾을 수 없습니다", 404);
        if (seedTeams.some((t) => t.id === a)) return fail("기본 팀은 바꿀 수 없습니다", 400);
        team.name = name;
        persist();
        return ok(teamRow(team));
      }
      if (a !== undefined && b === undefined && method === "DELETE") {
        if (seedTeams.some((t) => t.id === a)) return fail("기본 팀은 지울 수 없습니다", 400);
        data.teams = (data.teams ?? []).filter((t) => t.id !== a);
        if (data.teamMembers) delete data.teamMembers[a];
        persist();
        return ok(null, 204);
      }
      if (a !== undefined && b === "members") {
        const ids = data.teamMembers?.[a] ?? [];
        if (method === "GET" && c === undefined) {
          return ok(
            ids.map((id) => ({
              memberId: id,
              displayName: data.users.find((u) => u.id === id)?.name ?? null,
              email: emailOf(id),
              role: "MEMBER",
            })),
          );
        }
        if (c !== undefined && method === "PUT") {
          data.teamMembers ??= {};
          data.teamMembers[a] = [...new Set([...ids, c])]; // 멱등 — 백엔드와 같다
          persist();
          return ok(null, 204);
        }
        if (c !== undefined && method === "PATCH") {
          // 목업은 팀원 역할을 저장하지 않는다(모두 MEMBER) — 성공만 돌려주면 화면이 거짓말을 한다.
          return fail("목업 모드에서는 팀원 역할을 바꿀 수 없습니다", 400);
        }
        if (c !== undefined && method === "DELETE") {
          data.teamMembers ??= {};
          data.teamMembers[a] = ids.filter((id) => id !== c);
          persist();
          return ok(null, 204);
        }
      }
    }

    if (head === "grants") {
      const globals = (org().globalGrants ??= []);
      if (method === "GET" && a === undefined) {
        const scope = params.get("resourceType") ?? "GLOBAL";
        if (scope === "GLOBAL") return ok(globals.map((g) => grantRow(g, "GLOBAL", null)));
        const resourceId = params.get("resourceId") ?? "";
        return ok(
          (data.grants?.[resourceId] ?? []).map((g) =>
            grantRow(
              { id: g.id, subjectType: g.subjectType.toUpperCase(), subjectId: g.subjectId, role: upperRole(g.role) },
              scope,
              resourceId,
            ),
          ),
        );
      }
      if (method === "POST" && a === undefined) {
        const scope = String(body.resourceType ?? "GLOBAL");
        const subjectType = String(body.subjectType ?? "USER");
        const subjectId = String(body.subjectId ?? "");
        const role = String(body.role ?? "VIEWER");
        if (scope === "GLOBAL") {
          if (globals.some((g) => g.subjectType === subjectType && g.subjectId === subjectId)) {
            return fail("이미 권한이 있는 대상입니다", 409);
          }
          const grant: OrgMockGrant = {
            id: newId(),
            subjectType: subjectType as OrgMockGrant["subjectType"],
            subjectId,
            role: role as OrgMockGrant["role"],
          };
          globals.push(grant);
          persist();
          return ok(grantRow(grant, "GLOBAL", null), 201);
        }
        const resourceId = String(body.resourceId ?? "");
        data.grants ??= {};
        const current = data.grants[resourceId] ?? [];
        if (current.some((g) => g.subjectType === subjectType.toLowerCase() && g.subjectId === subjectId)) {
          return fail("이미 권한이 있는 대상입니다", 409);
        }
        const grant: SpaceGrant = {
          id: newId(),
          subjectType: subjectType === "TEAM" ? "team" : "user",
          subjectId,
          role: lowerRole(role),
        };
        data.grants[resourceId] = [...current, grant];
        persist();
        return ok(
          grantRow({ id: grant.id, subjectType, subjectId, role: upperRole(grant.role) }, scope, resourceId),
          201,
        );
      }
      if (a !== undefined && method === "PATCH") {
        const role = String(body.role ?? "");
        const global = globals.find((g) => g.id === a);
        if (global) {
          global.role = role as OrgMockGrant["role"];
          persist();
          return ok(null, 204);
        }
        for (const list of Object.values(data.grants ?? {})) {
          const found = list.find((g) => g.id === a);
          if (found) {
            found.role = lowerRole(role);
            persist();
            return ok(null, 204);
          }
        }
        return fail("권한을 찾을 수 없습니다", 404);
      }
      if (a !== undefined && method === "DELETE") {
        org().globalGrants = globals.filter((g) => g.id !== a);
        for (const [spaceId, list] of Object.entries(data.grants ?? {})) {
          data.grants![spaceId] = list.filter((g) => g.id !== a);
        }
        persist();
        return ok(null, 204);
      }
    }

    return fail(`목업 org API에 없는 경로입니다: ${method} ${url.pathname}`, 404);
  }

  return (path: string, init?: RequestInit): Promise<Response> => handle(path, init);
}
