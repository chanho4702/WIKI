import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, ensurePersonalSpace, listSpaces } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/** 개인 스페이스(W23). 한 사람에 하나, 없으면 그 자리에서 만든다 — 물어볼 것이 없다. */
describe("W23 개인 스페이스", () => {
  it("두 번 불러도 하나다", async () => {
    const a = await ensurePersonalSpace();
    const b = await ensurePersonalSpace();

    expect(b.id).toBe(a.id);
    expect(a.key).toBe("me-u1");
    expect((await listSpaces()).filter((s) => s.ownerId === "u1")).toHaveLength(1);
  });

  it("글로벌 네비 '내 스페이스'를 누르면 만들어서 들어간다", async () => {
    const user = userEvent.setup();
    renderApp("/home");
    await screen.findByRole("heading", { name: "마지막 작업하던 곳에서 다시 시작" });

    await user.click(screen.getByRole("button", { name: "내 스페이스" }));

    await waitFor(async () => {
      const mine = (await listSpaces()).find((s) => s.ownerId === "u1");
      expect(mine).toBeDefined();
      expect(screen.getByTestId("location")).toHaveTextContent(`/spaces/${mine!.id}`);
    });
  });
});
