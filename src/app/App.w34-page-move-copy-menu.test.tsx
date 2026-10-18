import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, archivePage, getPage, listChildren } from "../features/wiki/store/wikiStore";

/*
 * F-02 — 문서 보기의 "⋯" 메뉴에 이동·복제. 트리 행 메뉴와 같은 대화상자를 연다.
 */

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

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
    expect(within(target).queryByRole("option", { name: "팀 규칙" })).not.toBeInTheDocument();
    await user.selectOptions(target, "pg1");
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
