import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, seedOrgState } from "./testUtils";
import {
  __resetForTest,
  createPage,
  createSpace,
  getSpaceWatchState,
  getWatchState,
  listWatches,
  setSpaceWatchState,
  setWatchState,
} from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";
import type { Page, WikiData } from "../features/wiki/store/types";

/*
 * F-06 — 구독은 할 수 있는데 무엇을 구독했는지 보거나 한꺼번에 해제할 수 없었다.
 */

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

async function watchFive() {
  for (const id of ["pg1", "pg2", "pg3", "pg4", "pg5"]) await setWatchState(id, true);
  const ops = await createSpace({ key: "OPS", name: "운영 위키" });
  await setSpaceWatchState("sp1", true);
  await setSpaceWatchState(ops.id, true);
  return ops;
}

describe("F-06 구독 목록", () => {
  it("문서 5개·스페이스 2개를 구독하면 종류별로 7개가 나오고, 골라서 한꺼번에 해제한다", async () => {
    const user = userEvent.setup();
    const ops = await watchFive();
    renderApp("/settings/watches");

    const pages = await screen.findByRole("table", { name: "구독한 문서" });
    const spaces = screen.getByRole("table", { name: "구독한 스페이스" });
    expect(within(pages).getAllByRole("checkbox")).toHaveLength(5);
    expect(within(spaces).getAllByRole("checkbox")).toHaveLength(2);

    await user.click(within(pages).getByRole("checkbox", { name: "시작하기 선택" }));
    await user.click(within(pages).getByRole("checkbox", { name: "팀 규칙 선택" }));
    await user.click(within(spaces).getByRole("checkbox", { name: "운영 위키 선택" }));
    await user.click(screen.getByRole("button", { name: "구독 해제 (3)" }));

    await waitFor(() => expect(within(screen.getByRole("table", { name: "구독한 문서" })).getAllByRole("checkbox")).toHaveLength(3));
    expect(await getWatchState("pg1")).toBe(false);
    expect(await getWatchState("pg2")).toBe(false);
    expect(await getWatchState("pg3")).toBe(true);
    expect(await getSpaceWatchState(ops.id)).toBe(false);
    expect(await getSpaceWatchState("sp1")).toBe(true);
  });

  it("볼 수 없게 된 문서는 제목을 가리지만 해제는 할 수 있다", async () => {
    const seed = createSeedData();
    const hiddenDraft = {
      ...seed.pages[0], id: "dOther", title: "남의 비밀 초안", status: "draft", createdBy: "u2", parentId: null,
    } as Page;
    const data: WikiData = { ...seed, pages: [...seed.pages, hiddenDraft], watches: { dOther: ["u1", "u2"] } };
    localStorage.setItem("wiki.v1", JSON.stringify(data));
    __resetForTest();
    seedOrgState({ self: { status: "ACTIVE", globalRoles: [] } });

    const list = await listWatches();
    expect(list.pages).toEqual([expect.objectContaining({ pageId: "dOther", title: null, hidden: true })]);

    const user = userEvent.setup();
    renderApp("/settings/watches");
    const table = await screen.findByRole("table", { name: "구독한 문서" });
    expect(within(table).queryByText("남의 비밀 초안")).not.toBeInTheDocument();
    expect(within(table).getByText("볼 수 없는 문서")).toBeInTheDocument();
    await user.click(within(table).getByRole("checkbox", { name: "볼 수 없는 문서 선택" }));
    await user.click(screen.getByRole("button", { name: "구독 해제 (1)" }));
    expect(await screen.findByRole("heading", { name: "구독한 항목이 없습니다" })).toBeInTheDocument();
  });

  it("알림 설정에서 구독 목록으로 간다", async () => {
    const user = userEvent.setup();
    await createPage({ spaceId: "sp1", title: "아무 문서" }); // 만들면 자동 구독
    renderApp("/settings/notifications");
    await user.click(await screen.findByRole("link", { name: "구독한 문서·스페이스 관리" }));
    expect(await screen.findByRole("table", { name: "구독한 문서" })).toBeInTheDocument();
  });
});
