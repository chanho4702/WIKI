import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, createPage, listChildren } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** 블로그(W24) — 글은 페이지지만 트리에 없고, 목록은 최신순. */
describe("W24 블로그", () => {
  it("블로그 글은 트리에 나타나지 않고 블로그 목록에 최신순으로 온다", async () => {
    await createPage({ spaceId: "sp1", parentId: null, title: "첫 소식", type: "blog", body: "# 머리\n\n**공지** 본문" });
    await createPage({ spaceId: "sp1", parentId: null, title: "둘째 소식", type: "blog", body: "" });

    expect((await listChildren("sp1", null)).some((n) => n.title === "첫 소식")).toBe(false);

    renderApp("/spaces/sp1/blog");
    const list = await screen.findByRole("list", { name: "블로그 글" });
    const titles = within(list).getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["둘째 소식", "첫 소식"]);
    expect(within(list).getByText("머리 공지 본문")).toBeInTheDocument();
  });

  it("사이드바 '블로그'로 들어가고 '글 쓰기'는 초안을 만들어 편집 화면을 연다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");

    await user.click(await screen.findByRole("link", { name: "블로그" }));
    expect(await screen.findByRole("heading", { name: "블로그" })).toBeInTheDocument();
    expect(screen.getByText("아직 글이 없습니다")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "글 쓰기" }));
    expect(await screen.findByRole("button", { name: "게시" })).toBeInTheDocument();
  });

  it("만들기 메뉴에 '블로그 글'이 있고 트리 행에서 만들어도 부모가 없다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(within(tree).getByRole("button", { name: "시작하기 하위 콘텐츠 추가" }));
    await user.click(await screen.findByRole("menuitem", { name: "블로그 글" }));

    await screen.findByRole("button", { name: "게시" });
    const roots = await listChildren("sp1", null);
    expect(roots.some((n) => n.title === "제목 없는 글")).toBe(false);
  });
});
