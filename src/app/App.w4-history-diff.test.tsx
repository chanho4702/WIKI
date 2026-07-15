import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, updatePage } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W4 버전 diff", () => {
  it("최신 버전의 변경사항 탭이 직전 버전과의 라인 diff를 보여준다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1"); // pg1은 v1/v2 두 버전
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    await user.click(await screen.findByRole("tab", { name: "변경사항" }));
    const diff = await screen.findByTestId("diff-view");
    // v1에만 있던 라인은 removed, v2에 새로 들어온 라인은 added
    expect(within(diff).getByText("초기 안내 문서입니다.")).toHaveClass("diff-removed");
    expect(within(diff).getByText("## 시작 순서")).toHaveClass("diff-added");
  });

  it("v1을 선택하면 전체가 added로 표시된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    await user.click(await screen.findByRole("button", { name: /v1/ }));
    await user.click(screen.getByRole("tab", { name: "변경사항" }));
    const diff = await screen.findByTestId("diff-view");
    expect(within(diff).getByText("# 개발 위키")).toHaveClass("diff-added");
    expect(within(diff).getByText("초기 안내 문서입니다.")).toHaveClass("diff-added");
  });

  it("제목이 바뀐 버전은 제목 변경 한 줄을 표시한다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { title: "팀 규칙 개정판" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙 개정판" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    await user.click(await screen.findByRole("tab", { name: "변경사항" }));
    expect(await screen.findByText("제목: 팀 규칙 → 팀 규칙 개정판")).toBeInTheDocument();
  });
});
