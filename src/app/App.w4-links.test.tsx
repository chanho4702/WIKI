import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, updatePage } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W4 [[제목]] 페이지 링크", () => {
  it("존재하는 제목은 페이지 링크로 렌더되고 클릭하면 이동한다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { body: "[[시작하기]] 문서를 참고하세요" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    const article = screen.getByRole("article"); // 사이드바 NavLink와 구분
    const link = within(article).getByRole("link", { name: "시작하기" });
    expect(link).toHaveAttribute("href", "/spaces/sp1/pages/pg1");
    expect(link).not.toHaveClass("wiki-link-missing");
    await user.click(link);
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
  });

  it("없는 제목은 danger 스타일 링크로 렌더되고 클릭하면 제목이 채워진 생성 화면으로 간다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { body: "[[운영 런북]]을 먼저 만들자" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    const article = screen.getByRole("article");
    const link = within(article).getByRole("link", { name: "운영 런북" });
    expect(link).toHaveClass("wiki-link-missing");
    await user.click(link);
    expect(await screen.findByLabelText("제목")).toHaveValue("운영 런북");
  });
});
