import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, seedOrgState } from "./testUtils";
import { __resetForTest, listTeamMembers, listTeams } from "../features/wiki/store/wikiStore";
import * as store from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

afterEach(() => vi.restoreAllMocks());

/**
 * 사용자·팀 관리(U4) — 화면은 공용 패키지 `@chanho/org-admin`이 그리고, 위키는 마운트만 한다.
 *
 * 여기서 검증하는 것은 **경계면**이다: ⚙ 메뉴에서 닿는지, 옛 경로가 살아 있는지, 목업 fetch가
 * 패키지가 기대하는 `/api/org/*` 계약대로 답하는지. 화면 내부 동작은 패키지 테스트의 몫이다.
 */
describe("U4 사용자·팀 관리 마운트", () => {
  it("설정 메뉴에서 사용자·팀 관리로 들어가 사용자 목록을 본다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "설정" }));
    await user.click(await screen.findByRole("menuitem", { name: /사용자·팀/ }));

    expect(await screen.findByRole("heading", { name: "사용자·팀 관리" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "사용자 목록" });
    expect(within(table).getByText("김찬호")).toBeInTheDocument();
    expect(within(table).getByText("u1@example.com")).toBeInTheDocument();
  });

  /** 팀 관리 화면은 패키지의 "팀" 탭으로 옮겼다 — 기존 링크·북마크가 죽으면 안 된다. */
  it("옛 /admin/teams는 새 팀 탭으로 넘긴다", async () => {
    renderApp("/admin/teams");

    expect(await screen.findByRole("list", { name: "팀 목록" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/admin/org/teams");
  });

  /** W23 팀 관리 테스트의 이관분 — 만들고, 넣고, 뺀다. 원장은 그대로 org 목업이다. */
  it("팀을 만들고 사람을 넣고 뺀다", async () => {
    const user = userEvent.setup();
    renderApp("/admin/org/teams");
    await screen.findByRole("list", { name: "팀 목록" });
    // 셸 헤더에도 "만들기"가 있다(콘텐츠 생성) — 관리 화면 안으로 좁힌다
    const admin = within(screen.getByRole("main"));

    // 0.1.2부터 만들기 카드는 "새 팀 이름", 상세의 이름 변경은 "팀 이름"으로 접근 이름이 갈린다
    await user.type(admin.getByLabelText("새 팀 이름"), "운영팀");
    await user.click(admin.getByRole("button", { name: "만들기" }));

    // 0.1.2부터 만든 팀이 곧바로 선택된다(0.1.0의 "첫 팀으로 되돌림" 결함 수정)
    expect(await screen.findByRole("heading", { level: 2, name: "운영팀" })).toBeInTheDocument();
    const created = (await listTeams()).find((t) => t.name === "운영팀");
    expect(created).toBeDefined();

    await user.type(screen.getByLabelText("사용자 검색"), "이서연");
    const results = await screen.findByRole("group", { name: "사용자 검색 검색 결과" });
    await user.click(within(results).getByRole("button", { name: /이서연/ }));
    await user.click(screen.getByRole("button", { name: "팀원 추가" }));

    const members = await screen.findByRole("table", { name: "운영팀 팀원" });
    expect(within(members).getByText("이서연")).toBeInTheDocument();
    expect((await listTeamMembers(created!.id)).map((m) => m.memberId)).toEqual(["u2"]);

    await user.click(within(members).getByRole("button", { name: "제거" }));
    expect(await screen.findByRole("heading", { name: "팀원이 없습니다" })).toBeInTheDocument();
  });

  /** 같은 이름의 팀은 서버가 막는다 — 문구를 화면이 그대로 보여준다(공용 오류 계약). */
  it("같은 이름의 팀은 거부한다", async () => {
    const user = userEvent.setup();
    renderApp("/admin/org/teams");
    await screen.findByRole("list", { name: "팀 목록" });
    const admin = within(screen.getByRole("main"));

    await user.type(admin.getByLabelText("새 팀 이름"), "플랫폼팀");
    await user.click(admin.getByRole("button", { name: "만들기" }));

    expect(await screen.findByText(/이미 존재하는 팀 이름/)).toBeInTheDocument();
  });
});

/**
 * 권한 이력(org-admin 0.3.0) — 전역 권한 부여·변경·회수 기록. 패키지가 `GET /api/org/grants/audit`를 부르므로
 * 목업 fetch가 그 계약(최신순 배열, detail=역할)으로 답하는지와 메뉴 노출이 이 리포의 몫이다.
 */
describe("org-admin 0.3.0 권한 이력 마운트", () => {
  it("전역 관리자는 메뉴에서 권한 이력으로 들어가 방금 부여한 전역 역할 기록을 본다", async () => {
    const user = userEvent.setup();
    const grant = await store.orgApiFetch("/api/org/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectType: "USER", subjectId: "u2", resourceType: "GLOBAL", role: "ADMIN" }),
    });
    expect(grant.status).toBe(201);

    renderApp("/admin/org/users");
    await user.click(await screen.findByRole("link", { name: /권한 이력/ }));

    const table = await screen.findByRole("table", { name: "권한 이력" });
    expect(within(table).getByText("이서연")).toBeInTheDocument();
    expect(within(table).getByText("부여")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/admin/org/grant-audit");
  });

  it("전역 관리자가 아니면 권한 이력 메뉴가 없고, 목업도 서버처럼 403을 준다", async () => {
    seedOrgState({ self: { status: "ACTIVE", globalRoles: [] } });
    renderApp("/admin/org/users");
    await screen.findByRole("heading", { name: "사용자·팀 관리" });

    expect(screen.queryByRole("link", { name: /권한 이력/ })).not.toBeInTheDocument();
    const res = await store.orgApiFetch("/api/org/grants/audit?resourceType=GLOBAL");
    expect(res.status).toBe(403);
  });
});

describe("U4 전역 관리자 판정", () => {
  /** 판정 근거는 `/api/org/me.globalRoles` 하나다 — 아니면 관리 항목이 통째로 없다. */
  it("globalRoles에 ADMIN이 없으면 설정 메뉴에 관리 항목이 없다", async () => {
    seedOrgState({ self: { status: "ACTIVE", globalRoles: [] } });
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "설정" }));

    expect(await screen.findByRole("menuitem", { name: /단축키 도움말/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /사용자·팀/ })).not.toBeInTheDocument();
  });
});

describe("U4 스페이스 권한 대상 검색", () => {
  it("검색어로 대상 후보를 좁히고, 없으면 초대 화면으로 보낸다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/settings/permissions");
    await screen.findByRole("heading", { level: 1, name: "권한" });

    // "선택하세요"는 DS Select의 자리표시자라 옵션이 아니다 — 후보만 센다
    await user.click(screen.getByRole("combobox", { name: "대상" }));
    await screen.findByRole("option", { name: "최다인" }); // 목록이 다 붙은 뒤에 센다
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(4);
    await user.keyboard("{Escape}");

    await user.type(screen.getByLabelText("대상 검색"), "이서");
    await user.click(screen.getByRole("combobox", { name: "대상" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("listbox"))
          .getAllByRole("option")
          .map((o) => o.textContent),
      ).toEqual(["이서연"]),
    );
    await user.keyboard("{Escape}");

    expect(screen.getByRole("link", { name: /초대하기/ })).toHaveAttribute(
      "href",
      "/admin/org/invitations?scope=SPACE&resourceId=sp1",
    );
  });
});

/**
 * 계정 상태 거부(U4) — 정지·비활성·승인 대기 계정에게 백엔드는 403 + `{"error": 한국어 사유}`를
 * 준다(`PermissionDecision`). 게이트를 지나온 뒤(예: 세션 중에 정지된 계정)에도 화면이 그 사유를
 * 삼키고 빈 목록으로 보이면 안 된다 — `extractError`가 살린 문구를 그대로 노출한다.
 */
describe("U4 계정 상태 거부 문구 노출", () => {
  it("홈은 스페이스 조회 거부 사유를 그대로 보여준다 — 빈 상태로 삼키지 않는다", async () => {
    vi.spyOn(store, "listSpaces").mockRejectedValue(new Error("정지된 계정입니다"));
    renderApp("/home");

    expect(await screen.findByText(/정지된 계정입니다/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "최근 방문한 페이지가 없습니다" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("페이지 보기는 본문 조회 거부 사유를 그대로 보여준다", async () => {
    vi.spyOn(store, "getPage").mockRejectedValue(new Error("승인 대기 중인 계정입니다"));
    renderApp("/spaces/sp1/pages/pg1");

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("승인 대기 중인 계정입니다")).toBeInTheDocument();
    expect(screen.queryByText("페이지를 찾을 수 없습니다")).not.toBeInTheDocument();
  });
});
