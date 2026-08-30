import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/**
 * 글로벌 네비 "최근"·"스페이스" 플라이아웃(W23).
 *
 * 별표 표시와 같은 형태 — 화살표를 누르면 오른쪽에 상자가 뜨고, 상위 10개만 보여준 뒤
 * "전체 보기"로 목록 화면에 넘긴다. 사이드바 옆 상자에 전체 목록을 쌓지 않는다.
 */
describe("W23 글로벌 네비 플라이아웃", () => {
  it("최근은 방문한 문서를 최신순으로 보여준다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    await user.click(screen.getByRole("button", { name: /최근/ }));

    const panel = await screen.findByRole("dialog", { name: "최근" });
    expect(await within(panel).findByRole("button", { name: /시작하기/ })).toBeInTheDocument();
  });

  it("최근에 본 문서가 없으면 그렇게 알린다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: /최근/ }));

    const panel = await screen.findByRole("dialog", { name: "최근" });
    expect(await within(panel).findByText("최근에 본 문서가 없습니다")).toBeInTheDocument();
  });

  it("스페이스는 목록을 보여주고 고르면 이동한다", async () => {
    const user = userEvent.setup();
    renderApp("/home");
    await screen.findByRole("heading", { name: "마지막 작업하던 곳에서 다시 시작" });

    await user.click(screen.getByRole("button", { name: "스페이스" }));
    const panel = await screen.findByRole("dialog", { name: "스페이스" });
    await user.click(within(panel).getByRole("button", { name: /개발 위키/ }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1");
    });
  });

  it("전체 보기로 스페이스 목록 화면에 간다", async () => {
    const user = userEvent.setup();
    renderApp("/home");
    await screen.findByRole("heading", { name: "마지막 작업하던 곳에서 다시 시작" });

    await user.click(screen.getByRole("button", { name: "스페이스" }));
    const panel = await screen.findByRole("dialog", { name: "스페이스" });
    await user.click(within(panel).getByRole("link", { name: "전체 보기" }));

    expect(await screen.findByRole("heading", { level: 1, name: "스페이스" })).toBeInTheDocument();
  });
});
