import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, listCommentThreads } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";
import type { Comment } from "../features/wiki/store/types";

/**
 * 댓글 쪽 목록(2026-10) — 댓글이 많은 문서도 첫 화면은 최신 스레드 한 쪽만 읽는다.
 *
 * 화면은 오래된 순으로 그리고 "이전 코멘트 더 보기"로 위를 채운다. 여기서 고정하는 것: 끝까지 닿는가,
 * 새 댓글이 빈틈 없이 끝에 붙는가, 옛 쪽에서 지운 것이 화면에서도 사라지는가, 인라인 스레드는 섞이지
 * 않는가.
 */
function seedComments(count: number, extra: Comment[] = []) {
  const seed = createSeedData();
  seed.comments = seed.comments.filter((c) => c.pageId !== "pg1");
  for (let i = 0; i < count; i++) {
    seed.comments.push({
      id: `cm-${String(i).padStart(3, "0")}`,
      pageId: "pg1",
      authorId: "u1",
      body: `댓글 ${i}`,
      parentId: null,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      updatedAt: null,
    });
  }
  seed.comments.push(...extra);
  localStorage.setItem("wiki.v1", JSON.stringify(seed));
  __resetForTest();
}

async function openComments() {
  renderApp("/spaces/sp1/pages/pg1");
  await screen.findByRole("heading", { level: 1, name: "시작하기" });
  return screen.findByRole("region", { name: "코멘트" });
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("댓글 쪽 목록", () => {
  it("최신 스레드 한 쪽만 먼저 보이고, 이전 코멘트 더 보기로 가장 오래된 것까지 닿는다", async () => {
    const user = userEvent.setup();
    seedComments(45);
    const region = await openComments();

    expect(await within(region).findByText("댓글 44")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (45)" })).toBeInTheDocument();
    expect(within(region).queryByText("댓글 24")).not.toBeInTheDocument();
    // 화면은 오래된 순 — 한 쪽 안에서도 위가 먼저 쓴 것
    const bodies = within(region).getAllByTestId("comment-body").map((el) => el.textContent);
    expect(bodies[0]).toBe("댓글 25");
    expect(bodies[bodies.length - 1]).toBe("댓글 44");

    await user.click(within(region).getByRole("button", { name: "이전 코멘트 25개 더 보기" }));
    expect(await within(region).findByText("댓글 5")).toBeInTheDocument();
    await user.click(within(region).getByRole("button", { name: "이전 코멘트 5개 더 보기" }));
    expect(await within(region).findByText("댓글 0")).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: /이전 코멘트/ })).not.toBeInTheDocument();
    expect(within(region).getAllByTestId("comment-body")).toHaveLength(45);
    expect(within(region).getAllByTestId("comment-body")[0]).toHaveTextContent("댓글 0");
  });

  it("새 댓글은 읽은 범위 끝에 붙고 건수가 오른다", async () => {
    const user = userEvent.setup();
    seedComments(30);
    const region = await openComments();
    await within(region).findByText("댓글 29");

    await user.click(within(region).getByLabelText("코멘트 작성"));
    await user.type(within(region).getByLabelText("코멘트 작성"), "방금 쓴 댓글");
    await user.click(within(region).getByRole("button", { name: "코멘트 남기기" }));

    expect(await within(region).findByText("방금 쓴 댓글")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (31)" })).toBeInTheDocument();
    const bodies = within(region).getAllByTestId("comment-body");
    expect(bodies[bodies.length - 1]).toHaveTextContent("방금 쓴 댓글");
    // 아직 안 읽은 옛 스레드 수는 그대로다(새 댓글은 읽은 범위 안에 붙는다)
    expect(within(region).getByRole("button", { name: "이전 코멘트 10개 더 보기" })).toBeInTheDocument();
  });

  it("더 보기로 읽은 옛 스레드를 지우면 화면에서도 사라진다", async () => {
    const user = userEvent.setup();
    seedComments(25);
    const region = await openComments();
    await within(region).findByText("댓글 24");
    await user.click(within(region).getByRole("button", { name: "이전 코멘트 5개 더 보기" }));
    await within(region).findByText("댓글 0");

    // 오래된 순으로 그리므로 첫 삭제 버튼이 가장 오래된 "댓글 0"의 것이다
    await user.click(within(region).getAllByRole("button", { name: "삭제" })[0]);
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"));
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(within(region).queryByText("댓글 0")).not.toBeInTheDocument());
    expect(within(region).getByRole("heading", { name: "코멘트 (24)" })).toBeInTheDocument();
    expect(within(region).getAllByTestId("comment-body")).toHaveLength(24);
  });

  it("인라인 스레드는 하단 목록에도 건수에도 섞이지 않는다", async () => {
    seedComments(3, [
      {
        id: "cm-inline",
        pageId: "pg1",
        authorId: "u1",
        body: "인라인 지적",
        parentId: null,
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: null,
        anchorType: "inline",
        anchorQuote: "없는 구간",
        anchorOccurrence: 0,
      },
    ]);
    const region = await openComments();
    await within(region).findByText("댓글 2");
    expect(within(region).getByRole("heading", { name: "코멘트 (3)" })).toBeInTheDocument();
    expect(within(region).queryByText("인라인 지적")).not.toBeInTheDocument();

    const inline = await listCommentThreads("pg1", { kind: "inline" });
    expect(inline.threadCount).toBe(1);
    expect(inline.comments.map((c) => c.id)).toEqual(["cm-inline"]);
  });
});

describe("댓글 쪽 목록 — 스토어 계약(목업)", () => {
  it("스레드 단위로 자르고 답글은 스레드와 함께, 커서로 겹침 없이 끝까지", async () => {
    seedComments(5, [
      {
        id: "cm-reply",
        pageId: "pg1",
        authorId: "u2",
        body: "답글",
        parentId: "cm-001",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: null,
      },
    ]);
    const first = await listCommentThreads("pg1", { limit: 2 });
    expect(first.threadCount).toBe(5);
    expect(first.commentCount).toBe(6);
    expect(first.comments.map((c) => c.id)).toEqual(["cm-004", "cm-003"]);
    const second = await listCommentThreads("pg1", { limit: 2, before: first.nextBefore });
    expect(second.comments.map((c) => c.id)).toEqual(["cm-002", "cm-001", "cm-reply"]);
    const third = await listCommentThreads("pg1", { limit: 2, before: second.nextBefore });
    expect(third.comments.map((c) => c.id)).toEqual(["cm-000"]);
    expect(third.nextBefore).toBeNull();
    await expect(listCommentThreads("pg1", { before: "깨진커서" })).rejects.toThrow("댓글 목록 커서가 올바르지 않습니다");
  });
});
