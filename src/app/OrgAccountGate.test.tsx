import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@chanho/react";
import { seedOrgState } from "./testUtils";
import { OrgAccountGate } from "./OrgAccountGate";
import * as store from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";
import type { OrgMemberStatus } from "../features/wiki/store/types";

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

afterEach(() => vi.restoreAllMocks());

/**
 * 게이트는 로그인 게이트와 같은 조건으로 켜지므로(vitest에서는 꺼짐) 테스트에서만 강제로 켠다.
 */
function renderGate() {
  return render(
    <ToastProvider>
      <OrgAccountGate enabled>
        <div>위키 셸</div>
      </OrgAccountGate>
    </ToastProvider>,
  );
}

function seedStatus(status: OrgMemberStatus) {
  seedOrgState({ self: { status, globalRoles: [] } });
}

/**
 * 계정 상태 게이트(U4) — ALM `OrgAccountGate`와 같은 판정·문구를 쓴다.
 *
 * 로그인은 됐지만 승인 전이거나 정지·비활성된 계정은 org-service가 `/api/org/me` 외의 모든
 * 호출을 403으로 막는다. 셸을 그리면 화면마다 오류가 뜨므로 셸보다 바깥에서 한 번 막는다.
 */
describe("U4 계정 상태 게이트 (/api/org/me)", () => {
  it("ACTIVE면 셸을 그대로 그린다", async () => {
    seedStatus("ACTIVE");
    renderGate();

    expect(await screen.findByText("위키 셸")).toBeInTheDocument();
  });

  it("PENDING이면 셸 대신 공용 패키지의 승인 대기 화면을 그린다", async () => {
    seedStatus("PENDING");
    renderGate();

    expect(await screen.findByRole("heading", { name: "승인 대기 중" })).toBeInTheDocument();
    expect(screen.queryByText("위키 셸")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });

  it("SUSPENDED는 정지 안내를 보이고 앱을 열지 않는다", async () => {
    seedStatus("SUSPENDED");
    renderGate();

    expect(await screen.findByRole("heading", { name: "정지된 계정입니다" })).toBeInTheDocument();
    expect(screen.getByText(/관리자에게 해제를 요청/)).toBeInTheDocument();
    expect(screen.queryByText("위키 셸")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });

  it("DEACTIVATED는 비활성 안내를 보이고 앱을 열지 않는다 — 정지와 다른 문구다", async () => {
    seedStatus("DEACTIVATED");
    renderGate();

    expect(await screen.findByRole("heading", { name: "비활성된 계정입니다" })).toBeInTheDocument();
    expect(screen.getByText(/재초대를 요청/)).toBeInTheDocument();
    expect(screen.queryByText("위키 셸")).not.toBeInTheDocument();
  });

  /** 상태를 모르면 닫는다 — 삼키면 정지된 계정이 정상으로 보인다. */
  it("조회가 실패하면 사유를 그대로 띄우고 앱을 열지 않는다", async () => {
    vi.spyOn(store, "getOrgMe").mockRejectedValue(new Error("권한 서비스에 연결할 수 없습니다"));
    renderGate();

    expect(await screen.findByText("권한 서비스에 연결할 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByText("위키 셸")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("다시 시도가 성공하면 그 자리에서 셸로 넘어간다", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(store, "getOrgMe")
      .mockRejectedValueOnce(new Error("권한 서비스에 연결할 수 없습니다"));
    renderGate();
    await screen.findByRole("button", { name: "다시 시도" });

    spy.mockResolvedValue({
      id: "u1",
      displayName: "김찬호",
      email: "u1@example.com",
      status: "ACTIVE",
      globalRoles: [],
    });
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("위키 셸")).toBeInTheDocument();
  });

  /** 게이트가 꺼진 인스턴스(공개 문서·목업 dev)는 상태 조회 자체를 하지 않는다. */
  it("꺼져 있으면 /api/org/me를 부르지 않고 셸을 그린다", () => {
    const spy = vi.spyOn(store, "getOrgMe");
    render(
      <ToastProvider>
        <OrgAccountGate enabled={false}>
          <div>위키 셸</div>
        </OrgAccountGate>
      </ToastProvider>,
    );

    expect(screen.getByText("위키 셸")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});
