import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { allPagesForTest, renderApp } from "./testUtils";
import { __resetForTest, createSpace, getPage } from "../features/wiki/store/wikiStore";

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
    // W23부터 복제는 옵션(하위 포함·제한 포함)이 생겨 한 번 물어본다 — 기본은 단일 페이지다.
    const dialog = await screen.findByRole("dialog", { name: "페이지 복제" });
    await user.click(within(dialog).getByRole("button", { name: "복제" }));

    expect(await within(tree).findByText("시작하기 (사본)")).toBeInTheDocument();
    // 원본과 같은 부모·같은 본문의 새 페이지다
    const pages = await allPagesForTest("sp1");
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
    const pagesBefore = await allPagesForTest("sp1");
    const root = pagesBefore.find((p) => p.title === "시작하기")!;
    // 자손은 옵션에서 제외되므로(순환 방지) 다른 루트 페이지를 대상으로 고른다
    const target = pagesBefore.find((p) => p.id !== root.id && p.parentId === null)!;

    await user.click(within(tree).getByRole("button", { name: "시작하기 더보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "이동…" }));

    const dialog = await screen.findByRole("dialog", { name: "페이지 이동" });
    // 대상 위치 후보는 서버에서 온다(2026-08-29) — 목록이 채워질 때까지 기다린다.
    await user.selectOptions(await within(dialog).findByLabelText("대상 위치"), target.id);
    await user.click(within(dialog).getByRole("button", { name: "이동" }));

    // 스토어에 새 부모가 반영된다 (트리 갱신은 onMoved 리로드가 담당)
    const moved = (await allPagesForTest("sp1")).find((p) => p.title === "시작하기")!;
    expect(moved.parentId).toBe(target.id);
  });

  it("다른 스페이스로 이동 시 하위 처리 선택이 반영된다", async () => {
    const user = userEvent.setup();
    // 시드는 스페이스 하나뿐 — 렌더 전에 대상 스페이스를 만들어야 셀렉터가 나타난다
    const target2 = await createSpace({ key: "OPS", name: "운영 위키" });
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    const before = await allPagesForTest("sp1");
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
    const sp1After = await allPagesForTest("sp1");
    const sp2After = await allPagesForTest(target2.id);
    expect(sp2After.some((p) => p.id === root.id)).toBe(true);
    const stayed = sp1After.find((p) => p.id === child.id)!;
    expect(stayed.parentId).toBe(root.parentId);
  });

  it("이동 다이얼로그의 대상 목록에 자기 자신과 자손은 없다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    const pages = await allPagesForTest("sp1");
    const root = pages.find((p) => p.title === "시작하기")!;
    const childTitles = pages.filter((p) => p.parentId === root.id).map((p) => p.title);

    await user.click(within(tree).getByRole("button", { name: "시작하기 더보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "이동…" }));

    const select = await within(await screen.findByRole("dialog", { name: "페이지 이동" }))
      .findByLabelText("대상 위치");
    const options = within(select as HTMLElement).getAllByRole("option").map((o) => o.textContent?.trim());
    expect(options).toContain("(맨 위)");
    expect(options).not.toContain("시작하기");
    for (const title of childTitles) expect(options).not.toContain(title);
  });
});

/** 트리 행 ⋯ 메뉴 — 인라인 이름 바꾸기·별표 (2026-08-23). 모달이 아니라 행 자체가 입력으로 바뀐다. */
describe("트리 인라인 이름 바꾸기·별표", () => {
  it("이름 바꾸기를 누르면 행이 입력으로 바뀌고 Enter가 저장한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(within(tree).getByRole("button", { name: "시작하기 더보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "이름 바꾸기" }));

    const input = await within(tree).findByRole("textbox", { name: "시작하기 이름 바꾸기" });
    await user.clear(input);
    await user.type(input, "온보딩 가이드{Enter}");

    expect(await within(tree).findByRole("link", { name: "온보딩 가이드" })).toBeInTheDocument();
    const renamed = (await allPagesForTest("sp1")).find((p) => p.id === "pg1")!;
    expect(renamed.title).toBe("온보딩 가이드");
  });

  it("Escape는 취소 — 이름이 그대로다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(within(tree).getByRole("button", { name: "시작하기 더보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "이름 바꾸기" }));
    await user.keyboard("무시될 입력{Escape}");

    expect(within(tree).getByRole("link", { name: "시작하기" })).toBeInTheDocument();
    expect((await getPage("pg1"))!.title).toBe("시작하기");
  });

  it("⋯ 메뉴의 별표 표시가 별표 목록에 스냅샷을 저장한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(within(tree).getByRole("button", { name: "시작하기 더보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "별표 표시" }));

    const raw = JSON.parse(localStorage.getItem("wiki.ui.starredPages") ?? "[]") as Array<{
      id: string;
      title: string;
      spaceId: string;
    }>;
    expect(raw).toEqual([expect.objectContaining({ id: "pg1", title: "시작하기", spaceId: "sp1" })]);
  });
});
