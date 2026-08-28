import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { allPagesForTest, renderApp } from "./testUtils";
import {
  __resetForTest,
  deletePage,
  getPage,
  listTrash,
  purgePage,
  restorePage,
} from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

describe("W21-1 휴지통 — 스토어 계약", () => {
  it("삭제한 페이지는 트리에서 사라지고 휴지통에 남는다", async () => {
    await deletePage("pg2");

    expect(await getPage("pg2")).toBeNull();
    expect((await allPagesForTest("sp1")).map((p) => p.id)).not.toContain("pg2");
    const trash = await listTrash("sp1");
    expect(trash.map((t) => t.title)).toEqual(["팀 규칙"]);
    expect(trash[0].descendantCount).toBe(0);
  });

  it("cascade로 버린 하위는 개수로만 보이고 복원 시 함께 돌아온다", async () => {
    // pg1 > pg3 > pg5, pg1 > pg4
    await deletePage("pg1", { children: "cascade" });

    const trash = await listTrash("sp1");
    expect(trash).toHaveLength(1);
    expect(trash[0].descendantCount).toBe(3);

    const result = await restorePage("pg1");

    expect(result.restoredCount).toBe(4);
    expect(result.reparentedToRoot).toBe(false);
    expect((await allPagesForTest("sp1")).map((p) => p.id).sort()).toContain("pg5");
    expect((await getPage("pg5"))?.parentId).toBe("pg3");
    expect(await listTrash("sp1")).toHaveLength(0);
  });

  it("따로 버린 하위 묶음은 상위 복원에 휩쓸리지 않는다", async () => {
    await deletePage("pg5");
    await deletePage("pg3");

    const result = await restorePage("pg3");

    expect(result.restoredCount).toBe(1);
    expect(await getPage("pg5")).toBeNull();
    expect((await listTrash("sp1")).map((t) => t.title)).toEqual(["로컬 DB 설정"]);
  });

  it("부모가 영구 삭제된 뒤 복원하면 최상위로 올라오고 그 사실을 알린다", async () => {
    await deletePage("pg5");
    await deletePage("pg3");
    await purgePage("pg3");

    const result = await restorePage("pg5");

    expect(result.reparentedToRoot).toBe(true);
    expect((await getPage("pg5"))?.parentId).toBeNull();
  });

  it("버전과 댓글도 함께 보관되어 복원하면 되살아난다", async () => {
    const { listVersions, listComments } = await import("../features/wiki/store/wikiStore");
    await deletePage("pg1", { children: "cascade" });
    await restorePage("pg1");

    expect(await listVersions("pg1")).toHaveLength(2);
    expect(await listComments("pg1")).toHaveLength(2);
  });
});

describe("W21-1 휴지통 — 화면", () => {
  it("사이드바 휴지통으로 들어가 삭제한 문서를 복원한다", async () => {
    const user = userEvent.setup();
    await deletePage("pg2");
    renderApp("/spaces/sp1");

    await user.click(await screen.findByRole("link", { name: "휴지통" }));

    const row = await screen.findByRole("row", { name: /팀 규칙/ });
    await user.click(within(row).getByRole("button", { name: /복원/ }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg2");
    });
    expect(await getPage("pg2")).not.toBeNull();
  });

  it("영구 삭제는 확인을 받고 나서만 지운다", async () => {
    const user = userEvent.setup();
    await deletePage("pg2");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderApp("/spaces/sp1/trash");

    const row = await screen.findByRole("row", { name: /팀 규칙/ });
    await user.click(within(row).getByRole("button", { name: /영구 삭제/ }));

    expect(confirm).toHaveBeenCalled();
    expect(await listTrash("sp1")).toHaveLength(1);

    confirm.mockReturnValue(true);
    await user.click(within(row).getByRole("button", { name: /영구 삭제/ }));

    await waitFor(async () => {
      expect(await listTrash("sp1")).toHaveLength(0);
    });
    confirm.mockRestore();
  });

  it("휴지통이 비어 있으면 비우기 버튼을 내보내지 않는다", async () => {
    renderApp("/spaces/sp1/trash");

    expect(await screen.findByRole("heading", { name: "휴지통이 비어 있습니다" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "휴지통 비우기" })).not.toBeInTheDocument();
  });
});
