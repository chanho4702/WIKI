import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import {
  __resetForTest,
  archivePage,
  getPage,
  listArchive,
  listChildren,
  searchPageTitles,
  unarchivePage,
} from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/**
 * 페이지 보관(W23). 휴지통은 "지웠다", 보관은 "끝났지만 남겨 둔다" — 트리·검색에서 빠지되
 * 링크로는 계속 열려야 한다.
 */
describe("W23 보관 — 스토어 계약", () => {
  it("보관하면 트리·제목 검색에서 빠지지만 직접 조회는 된다", async () => {
    // 시드: pg2(팀 규칙)는 루트, 하위 없음
    await archivePage("pg2");

    expect((await listChildren("sp1", null)).map((p) => p.id)).not.toContain("pg2");
    expect((await searchPageTitles("sp1", "팀 규칙")).map((p) => p.id)).not.toContain("pg2");
    expect((await getPage("pg2"))?.archivedAt).toBeTruthy();
  });

  it("하위까지 함께 보관되고 목록에는 루트만 하위 수와 함께 뜬다", async () => {
    // 시드: pg1 ← pg3 ← pg5, pg1 ← pg4
    await archivePage("pg1");

    const items = await listArchive("sp1");
    expect(items.map((i) => i.id)).toEqual(["pg1"]);
    expect(items[0].descendantCount).toBe(3);
    expect((await getPage("pg5"))?.archivedAt).toBeTruthy();
  });

  it("해제하면 원래 자리로 돌아온다", async () => {
    await archivePage("pg1");
    await unarchivePage("pg1");

    expect((await listChildren("sp1", null)).map((p) => p.id)).toContain("pg1");
    expect((await getPage("pg3"))?.archivedAt).toBeFalsy();
  });

  /** 부모가 보관 중이면 트리에 나타날 자리가 없다. */
  it("상위가 보관 중이면 하위만 해제할 수 없다", async () => {
    await archivePage("pg1");

    await expect(unarchivePage("pg3")).rejects.toThrow("상위 문서가 보관 중");
  });
});

describe("W23 보관 — 화면", () => {
  it("더보기 메뉴에서 보관하면 배너가 뜨고 편집 버튼이 사라진다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "보관" }));

    expect(await screen.findByText(/보관된 문서입니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "편집" })).not.toBeInTheDocument();
    await waitFor(() => {
      const tree = screen.getByRole("navigation", { name: "페이지 트리" });
      expect(within(tree).queryByText("팀 규칙")).not.toBeInTheDocument();
    });
  });

  it("보관함에서 해제할 수 있다", async () => {
    const user = userEvent.setup();
    await archivePage("pg2");
    renderApp("/spaces/sp1/archive");
    await screen.findByRole("heading", { level: 1, name: "보관함" });

    expect(await screen.findByRole("link", { name: /팀 규칙/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /보관 해제/ }));

    expect(await screen.findByRole("heading", { name: "보관한 문서가 없습니다" })).toBeInTheDocument();
    expect((await getPage("pg2"))?.archivedAt).toBeFalsy();
  });
});
