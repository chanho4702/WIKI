import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { HomePage } from "./HomePage";
import * as store from "../store/wikiStore";
import { createSeedData } from "../../../mock/seed";

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

afterEach(() => vi.restoreAllMocks());

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

/**
 * 홈은 자기 몫의 스페이스 목록을 따로 읽는다(셸이 읽은 것과 별개 — "이어서 작업" 하이드레이트용).
 * 그 호출이 거부되면(정지된 계정의 403, 권한 서비스 503) 사유를 그대로 보여야 한다 —
 * 삼키면 스켈레톤이 영원히 돌거나 "최근 방문한 페이지가 없습니다"라는 거짓 빈 상태가 된다.
 */
describe("홈 로드 실패", () => {
  it("스페이스 조회가 거부되면 사유를 그대로 보여준다", async () => {
    vi.spyOn(store, "listSpaces").mockRejectedValue(new Error("정지된 계정입니다"));
    renderHome();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("정지된 계정입니다");
    expect(screen.queryByRole("status")).not.toBeInTheDocument(); // 스켈레톤이 계속 돌면 안 된다
    expect(
      screen.queryByRole("heading", { name: "최근 방문한 페이지가 없습니다" }),
    ).not.toBeInTheDocument();
  });

  it("다시 시도가 성공하면 홈을 그린다", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(store, "listSpaces").mockRejectedValueOnce(new Error("정지된 계정입니다"));
    renderHome();
    await screen.findByRole("alert");

    spy.mockRestore();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(
      await screen.findByRole("heading", { name: "마지막 작업하던 곳에서 다시 시작" }),
    ).toBeInTheDocument();
  });
});

/*
 * W-13 — 홈이 스페이스 수만큼 요청을 한꺼번에 띄우고, "이어서 작업" 카드마다 본문 포함 getPage를 보냈다.
 */
describe("홈 요청 팬아웃(W-13)", () => {
  it("서버 방문 원장이 있으면 그것 한 번으로 카드를 그리고 본문(getPage)을 읽지 않는다", async () => {
    localStorage.setItem("wiki.ui.recentVisits", JSON.stringify([{ id: "pg2", at: new Date().toISOString() }]));
    vi.spyOn(store, "listRecentPages").mockResolvedValue([
      { id: "pg2", spaceId: "sp1", spaceName: "개발", title: "팀 규칙", icon: null, type: "page" },
    ]);
    const getPage = vi.spyOn(store, "getPage");
    renderHome();

    expect(await screen.findByRole("button", { name: /팀 규칙/ })).toBeInTheDocument();
    expect(getPage).not.toHaveBeenCalled();
  });

  it("스페이스별 최근 업데이트는 동시에 4개까지만 묻는다", async () => {
    const seed = createSeedData();
    const many = Array.from({ length: 12 }, (_, i) => ({ ...seed.spaces[0], id: `bulk${i}`, key: `B${i}`, name: `스페이스 ${i}` }));
    localStorage.setItem("wiki.v1", JSON.stringify({ ...seed, spaces: [...seed.spaces, ...many] }));
    store.__resetForTest();
    let running = 0;
    let peak = 0;
    let calls = 0;
    vi.spyOn(store, "listRecentlyUpdated").mockImplementation(async () => {
      calls++;
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return [];
    });
    renderHome();

    await vi.waitFor(() => expect(calls).toBe(seed.spaces.length + many.length), { timeout: 10000 });
    expect(peak).toBeLessThanOrEqual(4);
  });
});
