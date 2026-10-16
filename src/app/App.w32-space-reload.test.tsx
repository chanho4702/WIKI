import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import * as mockStore from "../features/wiki/store/wikiMock";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import type { Space } from "../features/wiki/store/types";

/** 스페이스 목록 재조회 경합(2026-10 교차 리뷰) — 늦게 온 앞 요청이 뒤 요청의 결과를 덮지 않는다. */
const spies = vi.hoisted(() => ({ listSpaces: vi.fn() }));
vi.mock("../features/wiki/store/wikiStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/wiki/store/wikiStore")>();
  return { ...actual, listSpaces: spies.listSpaces };
});

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  spies.listSpaces.mockReset();
  spies.listSpaces.mockImplementation(mockStore.listSpaces);
});

describe("스페이스 목록 재조회", () => {
  it("이름 저장 뒤의 늦은 목록 응답이 방금 저장한 라벨을 지우지 않는다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/settings");
    const editor = await screen.findByRole("region", { name: "스페이스 라벨" });

    // 이름 저장이 부르는 재조회를 붙잡아 둔다 — 라벨을 붙이기 전 상태를 담은 응답이 된다
    let release: () => void = () => {};
    spies.listSpaces.mockImplementationOnce(async () => {
      const stale: Space[] = await mockStore.listSpaces();
      await new Promise<void>((resolve) => (release = resolve));
      return stale;
    });
    await user.clear(screen.getByLabelText("이름"));
    await user.type(screen.getByLabelText("이름"), "새 이름");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await user.type(within(editor).getByLabelText("스페이스 라벨 추가"), "foo");
    await user.click(within(editor).getByRole("button", { name: "추가" }));
    await within(editor).findByText("foo");

    release();
    await waitFor(() => expect(spies.listSpaces).toHaveBeenCalledTimes(3));
    // 늦은 응답이 반영됐다면 편집기가 라벨 없는 상태로 돌아간다
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(within(editor).getByText("foo")).toBeInTheDocument();
  });
});
