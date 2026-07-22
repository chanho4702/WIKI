import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W9 홈 대시보드(/home)", () => {
  it("최근 방문이 없으면 '이어서 작업' EmptyState를 보여준다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/home");

    expect(
      await screen.findByRole("heading", { name: "마지막 작업하던 곳에서 다시 시작" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "최근 방문한 페이지가 없습니다" }),
    ).toBeInTheDocument();
  });

  it("최근 방문 로그가 있으면 카드로 보여주고, 클릭하면 그 페이지로 이동한다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    localStorage.setItem(
      "wiki.ui.recentVisits",
      JSON.stringify([{ id: "pg1", at: "2026-07-20T00:00:00.000Z" }]),
    );
    renderApp("/home");

    const section = await screen.findByRole("region", { name: "이어서 작업" });
    const card = await within(section).findByRole("button", { name: /시작하기/ });
    await user.click(card);

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg1");
    });
  });

  it("페이지를 보면 방문 로그가 쌓여 홈의 '이어서 작업'에 나타난다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    // 페이지 조회 → recordVisit 부수효과로 localStorage에 방문 기록
    const view = renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    view.unmount();

    renderApp("/home");
    const section = await screen.findByRole("region", { name: "이어서 작업" });
    expect(await within(section).findByRole("button", { name: /시작하기/ })).toBeInTheDocument();
  });
});
