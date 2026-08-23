import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, createSpace, getPage, listPages } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** 트리 행 ⋯ 메뉴 — 복제·이동 (W10). 드롭 규칙 자체는 pageTreeDnd.test.ts가 고정한다. */
describe("W10 트리 복제·이동", () => {
  it("⋯ 메뉴의 복제가 '(사본)' 페이지를 트리에 만든다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(within(tree).getByRole("button", { name: "시작하기 더보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "복제" }));

    expect(await within(tree).findByText("시작하기 (사본)")).toBeInTheDocument();
    // 원본과 같은 부모·같은 본문의 새 페이지다
    const pages = await listPages("sp1");
    const original = pages.find((p) => p.title === "시작하기")!;
    const copy = pages.find((p) => p.title === "시작하기 (사본)")!;
    expect(copy.parentId).toBe(original.parentId);
    expect(copy.id).not.toBe(original.id);
    expect((await getPage(copy.id))?.body).toBe((await getPage(original.id))?.body);
  });

  it("⋯ 메뉴의 이동이 다이얼로그에서 고른 부모 밑으로 옮긴다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    const pagesBefore = await listPages("sp1");
    const root = pagesBefore.find((p) => p.title === "시작하기")!;
    // 자손은 옵션에서 제외되므로(순환 방지) 다른 루트 페이지를 대상으로 고른다
    const target = pagesBefore.find((p) => p.id !== root.id && p.parentId === null)!;

    await user.click(within(tree).getByRole("button", { name: "시작하기 더보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "이동…" }));

    const dialog = await screen.findByRole("dialog", { name: "페이지 이동" });
    await user.selectOptions(within(dialog).getByLabelText("대상 위치"), target.id);
    await user.click(within(dialog).getByRole("button", { name: "이동" }));

    // 스토어에 새 부모가 반영된다 (트리 갱신은 onMoved 리로드가 담당)
    const moved = (await listPages("sp1")).find((p) => p.title === "시작하기")!;
    expect(moved.parentId).toBe(target.id);
  });

  it("다른 스페이스로 이동 시 하위 처리 선택이 반영된다", async () => {
    const user = userEvent.setup();
    // 시드는 스페이스 하나뿐 — 렌더 전에 대상 스페이스를 만들어야 셀렉터가 나타난다
    const target2 = await createSpace({ key: "OPS", name: "운영 위키" });
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    const before = await listPages("sp1");
    const root = before.find((p) => p.title === "시작하기")!;
    const child = before.find((p) => p.parentId === root.id)!;

    await user.click(within(tree).getByRole("button", { name: "시작하기 더보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "이동…" }));
    const dialog = await screen.findByRole("dialog", { name: "페이지 이동" });

    // 대상 스페이스를 sp2로 바꾸고, 하위는 현재 위치에 남기기(promote)
    await user.selectOptions(within(dialog).getByLabelText("대상 스페이스"), target2.id);
    await user.click(
      await within(dialog).findByRole("radio", {
        name: "하위 항목은 현재 위치에 남기기 (한 단계 위로)",
      }),
    );
    await user.click(within(dialog).getByRole("button", { name: "이동" }));

    // 루트는 sp2로, 하위는 sp1 루트로 승격
    const sp1After = await listPages("sp1");
    const sp2After = await listPages(target2.id);
    expect(sp2After.some((p) => p.id === root.id)).toBe(true);
    const stayed = sp1After.find((p) => p.id === child.id)!;
    expect(stayed.parentId).toBe(root.parentId);
  });

  it("이동 다이얼로그의 대상 목록에 자기 자신과 자손은 없다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    const pages = await listPages("sp1");
    const root = pages.find((p) => p.title === "시작하기")!;
    const childTitles = pages.filter((p) => p.parentId === root.id).map((p) => p.title);

    await user.click(within(tree).getByRole("button", { name: "시작하기 더보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "이동…" }));

    const select = within(await screen.findByRole("dialog", { name: "페이지 이동" }))
      .getByLabelText("대상 위치");
    const options = within(select as HTMLElement).getAllByRole("option").map((o) => o.textContent?.trim());
    expect(options).toContain("(맨 위)");
    expect(options).not.toContain("시작하기");
    for (const title of childTitles) expect(options).not.toContain(title);
  });
});
