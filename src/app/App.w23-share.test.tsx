import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, listNotifications, sharePage } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/**
 * 페이지 공유(W23). "이 문서 봐주세요"를 전할 방법이 없었다 — 링크를 메신저에 붙이거나
 * 본문에 멘션을 억지로 넣어야 했다. 공유는 수신자 알림함에 메모와 함께 뜬다.
 */
describe("W23 페이지 공유 — 스토어 계약", () => {
  it("받는 사람 수만큼 전달된다", async () => {
    expect(await sharePage("pg1", ["u2", "u3"], "검토 부탁")).toBe(2);
  });

  /** 자신에게 보내는 공유는 의미가 없다 — 전달 수에서 빠진다. */
  it("자신은 건너뛴다", async () => {
    expect(await sharePage("pg1", ["u1", "u2"])).toBe(1);
  });

  it("받는 사람이 없으면 거부한다", async () => {
    await expect(sharePage("pg1", [])).rejects.toThrow("받는 사람을 한 명 이상 고르세요");
  });

  it("메모는 300자까지다", async () => {
    await expect(sharePage("pg1", ["u2"], "x".repeat(301))).rejects.toThrow("300자");
  });
});

describe("W23 페이지 공유 — 화면", () => {
  it("공유 버튼에서 사람을 고르고 메모를 붙여 보낸다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    await user.click(screen.getByRole("button", { name: "공유" }));
    const dialog = await screen.findByRole("dialog", { name: "페이지 공유" });
    const list = within(dialog).getByRole("list", { name: "받는 사람" });
    // 자신은 목록에 없다
    expect(within(list).queryByLabelText(/김철수|u1/)).not.toBeInTheDocument();
    await user.click(within(list).getAllByRole("checkbox")[0]);
    await user.type(within(dialog).getByLabelText("메모 (선택)"), "검토 부탁");
    await user.click(within(dialog).getByRole("button", { name: "공유" }));

    await waitFor(async () => {
      const all = JSON.parse(localStorage.getItem("wiki.v1") ?? "{}") as {
        notifications?: Array<{ type: string; note?: string | null }>;
      };
      expect(all.notifications?.some((n) => n.type === "shared" && n.note === "검토 부탁")).toBe(true);
    });
    expect(await listNotifications()).toBeDefined();
  });

  it("공유 다이얼로그에서 링크를 복사할 수 있다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    await user.click(screen.getByRole("button", { name: "공유" }));
    const dialog = await screen.findByRole("dialog", { name: "페이지 공유" });

    expect(within(dialog).getByRole("button", { name: /링크 복사/ })).toBeInTheDocument();
    expect(within(dialog).getByText(/\/spaces\/sp1\/pages\/pg1/)).toBeInTheDocument();
  });
});
