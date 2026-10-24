import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { chooseOption, optionNames } from "./selectTestUtils";
import * as store from "../features/wiki/store/wikiStore";
import { getPage as mockGetPage } from "../features/wiki/store/wikiMock";
import { __resetForTest, archivePage, copyPage, createPage, createSpace, getPage, listChildren } from "../features/wiki/store/wikiStore";

/*
 * F-02 — 문서 보기의 "⋯" 메뉴에 이동·복제. 트리 행 메뉴와 같은 대화상자를 연다.
 */

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});
afterEach(() => vi.restoreAllMocks());

async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "더 보기" }));
}

describe("F-02 문서 ⋯ 메뉴의 이동·복제", () => {
  it("이동을 고르면 트리와 같은 이동 대화상자가 열리고, 고른 위치로 옮긴다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await openMore(user);
    await user.click(await screen.findByRole("menuitem", { name: "이동…" }));
    const dialog = await screen.findByRole("dialog", { name: "페이지 이동" });
    const target = await within(dialog).findByRole("combobox", { name: "대상 위치" });
    // 자기 자신은 대상 후보에 없다
    const names = await optionNames(user, target);
    expect(names).toContain("시작하기");
    expect(names).not.toContain("팀 규칙");
    await chooseOption(user, target, "시작하기");
    await user.click(within(dialog).getByRole("button", { name: "이동" }));

    await waitFor(async () => expect((await getPage("pg2"))!.parentId).toBe("pg1"));
    expect(await screen.findByText("페이지를 이동했습니다")).toBeInTheDocument();
  });

  it("복제를 고르면 복제 대화상자가 열리고 사본이 생긴다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await openMore(user);
    await user.click(await screen.findByRole("menuitem", { name: "복제" }));
    const dialog = await screen.findByRole("dialog", { name: "페이지 복제" });
    await user.click(within(dialog).getByRole("button", { name: "복제" }));

    await waitFor(async () => {
      const roots = await listChildren("sp1", null);
      expect(roots.filter((p) => p.title.includes("팀 규칙")).length).toBe(2);
    });
  });

  it("서버가 편집 권한 없음(canEdit=false)을 주면 이동·복제가 없다 — 모르면(null) 보인다", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "getPage").mockImplementation(async (id: string) => {
      const page = await mockGetPage(id);
      return page && id === "pg2" ? { ...page, canEdit: false } : page;
    });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    await openMore(user);
    await screen.findByRole("menuitem", { name: "내보내기" });
    expect(screen.queryByRole("menuitem", { name: "이동…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "복제" })).not.toBeInTheDocument();
  });

  it("보관된 문서와 읽기 전용 인스턴스에는 이동·복제가 없다", async () => {
    const user = userEvent.setup();
    await archivePage("pg2");
    const view = renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    await openMore(user);
    await screen.findByRole("menuitem", { name: "내보내기" });
    expect(screen.queryByRole("menuitem", { name: "이동…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "복제" })).not.toBeInTheDocument();
    view.unmount();

    renderApp("/spaces/sp1/pages/pg1", { readOnly: true });
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await openMore(user);
    await screen.findByRole("menuitem", { name: "내보내기" });
    expect(screen.queryByRole("menuitem", { name: "이동…" })).not.toBeInTheDocument();
  });
});

/* F-03 — 복사할 때 대상 스페이스·위치를 고른다. 고르지 않으면 원본 옆(예전과 같다). */
describe("F-03 복사 대상 선택", () => {
  it("다른 스페이스의 문서 아래로 복사하면 사본이 거기 생기고 원본은 그대로다", async () => {
    const user = userEvent.setup();
    const ops = await createSpace({ key: "OPS", name: "운영 위키" });
    const x = await createPage({ spaceId: ops.id, title: "운영 문서 X" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await user.click(await screen.findByRole("button", { name: "더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "복제" }));
    const dialog = await screen.findByRole("dialog", { name: "페이지 복제" });
    await chooseOption(user, await within(dialog).findByRole("combobox", { name: "복사할 스페이스" }), "운영 위키");
    const location = await within(dialog).findByRole("combobox", { name: "복사할 위치" });
    const names = await optionNames(user, location);
    expect(names).toContain("운영 문서 X");
    // 다른 스페이스에는 "원본 옆"이 없다
    expect(names).not.toContain("(원본 옆)");
    await chooseOption(user, location, "운영 문서 X");
    await user.click(within(dialog).getByRole("button", { name: "복제" }));

    await waitFor(async () => {
      const under = await listChildren(ops.id, x.id);
      expect(under.map((p) => p.title)).toEqual(["팀 규칙 (사본)"]);
    });
    expect((await getPage("pg2"))!.spaceId).toBe("sp1");
  });

  it("서버가 거부하면(대상 스페이스 편집 권한 없음) 대화상자 안에 문구가 보이고 닫히지 않는다", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "copyPage").mockRejectedValue(new Error("권한이 없습니다."));
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await user.click(await screen.findByRole("button", { name: "더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "복제" }));
    const dialog = await screen.findByRole("dialog", { name: "페이지 복제" });
    await user.click(within(dialog).getByRole("button", { name: "복제" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("권한이 없습니다.");
    expect(screen.getByRole("dialog", { name: "페이지 복제" })).toBeInTheDocument();
  });

  it("스토어 계약: 대상 없으면 원본 옆, 대상 부모가 다른 스페이스면 거부, 보관 문서는 거부", async () => {
    const ops = await createSpace({ key: "OPS", name: "운영 위키" });
    const beside = await copyPage("pg3");
    expect(beside).toMatchObject({ spaceId: "sp1", parentId: "pg1" });
    await expect(copyPage("pg3", { targetSpaceId: ops.id, targetParentId: "pg1" })).rejects.toThrow("대상 부모");
    const top = await copyPage("pg3", { targetSpaceId: ops.id });
    expect(top).toMatchObject({ spaceId: ops.id, parentId: null });
    await archivePage("pg2");
    await expect(copyPage("pg2")).rejects.toThrow("보관된 문서");
  });
});
