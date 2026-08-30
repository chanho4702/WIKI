import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import {
  __resetForTest,
  addComment,
  listComments,
  listPageReactions,
  setPageReaction,
} from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/**
 * 리액션(W23). "잘 봤다"를 표현할 방법이 댓글뿐이었다 — 한마디 남기자고 댓글을 쓰면 스레드가
 * 잡음으로 차고, 그래서 아무도 안 남긴다.
 */
describe("W23 리액션 — 스토어 계약", () => {
  it("켜고 끄면 집계가 따라온다", async () => {
    expect(await setPageReaction("pg1", "👍", true)).toEqual([{ emoji: "👍", count: 1, reacted: true }]);
    expect(await setPageReaction("pg1", "👍", false)).toEqual([]);
  });

  /** 두 번 눌러도 한 번이다 — 재시도가 수를 부풀리면 집계를 믿을 수 없다. */
  it("같은 이모지는 두 번 켜도 하나다", async () => {
    await setPageReaction("pg1", "🎉", true);
    await setPageReaction("pg1", "🎉", true);

    expect((await listPageReactions("pg1"))[0].count).toBe(1);
  });

  it("집합에 없는 이모지는 거부한다", async () => {
    await expect(setPageReaction("pg1", "💩", true)).rejects.toThrow("지원하지 않는 리액션");
  });

  it("댓글 리액션은 댓글 목록에 함께 온다", async () => {
    const c = await addComment("pg1", "댓글");
    const { setCommentReaction } = await import("../features/wiki/store/wikiStore");
    await setCommentReaction(c.id, "❤️", true);

    const found = (await listComments("pg1")).find((x) => x.id === c.id);
    expect(found?.reactions).toEqual([{ emoji: "❤️", count: 1, reacted: true }]);
  });
});

describe("W23 리액션 — 화면", () => {
  it("문서 아래에서 리액션을 고르면 칩이 생기고 다시 누르면 사라진다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    const bar = await screen.findByRole("group", { name: "문서 리액션" });
    await user.click(within(bar).getByRole("button", { name: "리액션 추가" }));
    await user.click(await screen.findByRole("menuitem", { name: "👍" }));

    const chip = await within(bar).findByRole("button", { name: "👍 1" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await waitFor(async () => {
      expect(await listPageReactions("pg1")).toHaveLength(1);
    });

    await user.click(chip);
    await waitFor(() => {
      expect(within(bar).queryByRole("button", { name: /👍/ })).not.toBeInTheDocument();
    });
  });

  it("댓글에도 리액션 줄이 있다", async () => {
    await addComment("pg1", "확인했습니다");
    renderApp("/spaces/sp1/pages/pg1");
    const comments = await screen.findByRole("region", { name: "코멘트" });

    expect(within(comments).getAllByRole("group", { name: "댓글 리액션" }).length).toBeGreaterThan(0);
  });
});
