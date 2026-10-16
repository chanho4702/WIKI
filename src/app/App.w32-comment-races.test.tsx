import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import * as mockStore from "../features/wiki/store/wikiMock";
import { __resetForTest, addComment, deleteComment } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";
import type { CommentThreadPage } from "../features/wiki/store/types";

/**
 * 댓글 쪽 목록의 경합·병합(2026-10 교차 리뷰 보강).
 * 늦게 온 "이전 코멘트" 응답, 빈 화면에서 시작한 병합, 옛 스레드의 리액션 보존, 인라인 읽기 실패.
 */
const spies = vi.hoisted(() => ({ listCommentThreads: vi.fn() }));
vi.mock("../features/wiki/store/wikiStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/wiki/store/wikiStore")>();
  return { ...actual, listCommentThreads: spies.listCommentThreads };
});

function seedComments(count: number) {
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
  localStorage.setItem("wiki.v1", JSON.stringify(seed));
  __resetForTest();
}

async function openComments() {
  renderApp("/spaces/sp1/pages/pg1");
  await screen.findByRole("heading", { level: 1, name: "시작하기" });
  return screen.findByRole("region", { name: "코멘트" });
}

/** 다른 사람이 그 사이 단 댓글 — 목업 저장소에 바로 넣는다(현재 시각이라 언제나 최신이다). */
async function othersWrite(count: number) {
  for (let i = 0; i < count; i++) await addComment("pg1", `남의 댓글 ${i}`);
}

async function postComment(region: HTMLElement, text: string) {
  const user = userEvent.setup();
  await user.click(within(region).getByLabelText("코멘트 작성"));
  await user.type(within(region).getByLabelText("코멘트 작성"), text);
  await user.click(within(region).getByRole("button", { name: "코멘트 남기기" }));
  await within(region).findByText(text);
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  spies.listCommentThreads.mockReset();
  spies.listCommentThreads.mockImplementation(mockStore.listCommentThreads);
});

describe("댓글 쪽 목록 — 경합과 병합", () => {
  it("빈 화면에서 시작해도 남이 쓴 만큼 '이전 코멘트'로 이어 읽을 수 있다", async () => {
    seedComments(0);
    const region = await openComments();
    await within(region).findByText(/아직 코멘트가 없습니다/);

    await othersWrite(25);
    await postComment(region, "내 첫 댓글");

    expect(within(region).getByRole("heading", { name: "코멘트 (26)" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "이전 코멘트 6개 더 보기" })).toBeInTheDocument();
  });

  it("목록이 다시 세워진 뒤 늦게 온 '이전 코멘트' 응답은 버린다", async () => {
    const user = userEvent.setup();
    seedComments(30);
    const region = await openComments();
    await within(region).findByText("댓글 29");

    // 첫 "이전 코멘트" 요청을 붙잡아 둔다
    let release: () => void = () => {};
    spies.listCommentThreads.mockImplementationOnce(async (...args: Parameters<typeof mockStore.listCommentThreads>) => {
      const result: CommentThreadPage = await mockStore.listCommentThreads(...args);
      await new Promise<void>((resolve) => (release = resolve));
      return result;
    });
    await user.click(within(region).getByRole("button", { name: "이전 코멘트 10개 더 보기" }));

    // 그 사이 남이 한 쪽 넘게 쓰고 내가 하나 더 쓰면 최신 쪽에 빈틈이 생겨 목록이 다시 세워진다
    await othersWrite(25);
    await postComment(region, "빈틈 뒤 내 댓글");
    expect(within(region).getByRole("heading", { name: "코멘트 (56)" })).toBeInTheDocument();

    release();
    await waitFor(() => expect(within(region).queryByText("불러오는 중…")).not.toBeInTheDocument());
    // 옛 자리의 응답(댓글 0~9)이 붙지 않았다 — 붙었다면 커서가 옛 자리로 돌아간다. 건수도 옛 응답 것이 아니다.
    expect(within(region).queryByText("댓글 0")).not.toBeInTheDocument();
    expect(within(region).getAllByTestId("comment-body")).toHaveLength(20);
    expect(within(region).getByRole("heading", { name: "코멘트 (56)" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "이전 코멘트 36개 더 보기" })).toBeInTheDocument();

    // 새 커서로 끝까지 읽으면 빠진 스레드가 없다
    for (;;) {
      const more = within(region).queryByRole("button", { name: /이전 코멘트/ });
      if (!more) break;
      await user.click(more);
      await waitFor(() => expect(within(region).queryByText("불러오는 중…")).not.toBeInTheDocument());
    }
    expect(within(region).getAllByTestId("comment-body")).toHaveLength(56);
  });

  it("지우기 전에 나간 '이전 코멘트' 응답이 지운 댓글을 되살리지 않고 건수도 되돌리지 않는다", async () => {
    const user = userEvent.setup();
    seedComments(22);
    const region = await openComments();
    await within(region).findByText("댓글 21");

    let release: () => void = () => {};
    spies.listCommentThreads.mockImplementationOnce(async (...args: Parameters<typeof mockStore.listCommentThreads>) => {
      const result: CommentThreadPage = await mockStore.listCommentThreads(...args);
      await new Promise<void>((resolve) => (release = resolve));
      return result;
    });
    await user.click(within(region).getByRole("button", { name: "이전 코멘트 2개 더 보기" }));

    // 최신 댓글을 지우면 최신 쪽에 옛 댓글(댓글 1)이 편입된다 — 그것도 지운다
    const remove = async (body: string) => {
      const bodies = within(region).getAllByTestId("comment-body");
      const index = bodies.findIndex((el) => el.textContent === body);
      await user.click(within(region).getAllByRole("button", { name: "삭제" })[index]);
      const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"));
      await user.click(within(dialog).getByRole("button", { name: "삭제" }));
      await waitFor(() => expect(within(region).queryByText(body)).not.toBeInTheDocument());
    };
    await remove("댓글 21");
    await within(region).findByText("댓글 1");
    await remove("댓글 1");
    expect(within(region).getByRole("heading", { name: "코멘트 (20)" })).toBeInTheDocument();

    release(); // 지우기 전 상태(댓글 0~1)를 담은 늦은 응답
    await waitFor(() => expect(within(region).queryByText("불러오는 중…")).not.toBeInTheDocument());
    expect(await within(region).findByText("댓글 0")).toBeInTheDocument();
    expect(within(region).queryByText("댓글 1")).not.toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (20)" })).toBeInTheDocument();
    expect(within(region).getAllByTestId("comment-body")).toHaveLength(20);
  }, 60_000); // 삭제 확인 대화상자를 두 번 거친다 — jsdom에서 느리다

  it("다른 곳에서 지운 댓글은 쓰기 뒤 재조회에서 사라진다(최신 쪽이 전부일 때)", async () => {
    seedComments(2);
    const region = await openComments();
    await within(region).findByText("댓글 1");

    await deleteComment("cm-000"); // 다른 탭에서 지운 것과 같다 — 이 화면은 모른다
    await postComment(region, "새 댓글");

    await waitFor(() => expect(within(region).queryByText("댓글 0")).not.toBeInTheDocument());
    expect(within(region).getByRole("heading", { name: "코멘트 (2)" })).toBeInTheDocument();
    expect(within(region).getAllByTestId("comment-body")).toHaveLength(2);
  });

  it("늦은 '이전 코멘트' 응답은 이미 최신으로 갈아끼운 스레드의 지워진 답글을 되살리지 않는다", async () => {
    const user = userEvent.setup();
    seedComments(22);
    const reply = await addComment("pg1", "옛 스레드의 답글", "cm-001");
    const region = await openComments();
    await within(region).findByText("댓글 21");

    let release: () => void = () => {};
    spies.listCommentThreads.mockImplementationOnce(async (...args: Parameters<typeof mockStore.listCommentThreads>) => {
      const result: CommentThreadPage = await mockStore.listCommentThreads(...args);
      await new Promise<void>((resolve) => (release = resolve));
      return result;
    });
    await user.click(within(region).getByRole("button", { name: "이전 코멘트 2개 더 보기" }));

    // 다른 곳에서 답글을 지우고, 이 화면에서 최신 댓글을 지운다 → 최신 쪽에 "댓글 1" 스레드가 (답글 없이) 편입
    await deleteComment(reply.id);
    const bodies = within(region).getAllByTestId("comment-body");
    const index = bodies.findIndex((el) => el.textContent === "댓글 21");
    await user.click(within(region).getAllByRole("button", { name: "삭제" })[index]);
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"));
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    expect(await within(region).findByText("댓글 1")).toBeInTheDocument();

    release(); // 답글이 살아 있던 때의 늦은 응답
    await waitFor(() => expect(within(region).queryByText("불러오는 중…")).not.toBeInTheDocument());
    expect(await within(region).findByText("댓글 0")).toBeInTheDocument(); // 늦은 응답의 새 스레드는 붙는다
    expect(within(region).queryByText("옛 스레드의 답글")).not.toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (21)" })).toBeInTheDocument();
    expect(within(region).getAllByTestId("comment-body")).toHaveLength(21);
  }, 60_000);

  it("요청 중에 쓰기가 있으면 늦은 '이전 코멘트' 응답을 버리고 같은 커서로 다시 읽는다", async () => {
    seedComments(22);
    const region = await openComments();
    await within(region).findByText("댓글 21");

    let release: () => void = () => {};
    spies.listCommentThreads.mockImplementationOnce(async (...args: Parameters<typeof mockStore.listCommentThreads>) => {
      const result: CommentThreadPage = await mockStore.listCommentThreads(...args);
      await new Promise<void>((resolve) => (release = resolve));
      return { ...result, comments: [...result.comments, { ...result.comments[0], id: "유령", body: "쓰기 전 세계의 댓글" }] };
    });
    const user = userEvent.setup();
    await user.click(within(region).getByRole("button", { name: "이전 코멘트 2개 더 보기" }));
    const olderCalls = () => spies.listCommentThreads.mock.calls.filter(([, o]) => o?.before);
    expect(olderCalls()).toHaveLength(1);

    await postComment(region, "쓰는 중"); // 쓰기 — 나가 있던 응답은 낡았다
    release();
    expect(await within(region).findByText("댓글 0")).toBeInTheDocument();
    expect(within(region).queryByText("쓰기 전 세계의 댓글")).not.toBeInTheDocument();
    expect(olderCalls()).toHaveLength(2);
    expect(olderCalls()[1][1]?.before).toBe(olderCalls()[0][1]?.before);
  });

  it("같은 시각의 숫자 id 댓글도 백엔드와 같은 순서로 이어 읽어 빠짐이 없다", async () => {
    const user = userEvent.setup();
    const seed = createSeedData();
    seed.comments = seed.comments.filter((c) => c.pageId !== "pg1");
    for (let id = 80; id <= 100; id++) {
      // 이관 댓글처럼 작성 시각이 모두 같다 — 순서는 id(수)가 정한다
      seed.comments.push({ id: String(id), pageId: "pg1", authorId: "u1", body: `댓글 ${id}`, parentId: null,
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null });
    }
    localStorage.setItem("wiki.v1", JSON.stringify(seed));
    __resetForTest();
    const region = await openComments();
    await within(region).findByText("댓글 100");
    expect(within(region).queryByText("댓글 80")).not.toBeInTheDocument(); // 최신 20 = 81~100

    await postComment(region, "새 댓글");
    await user.click(within(region).getByRole("button", { name: "이전 코멘트 1개 더 보기" }));
    expect(await within(region).findByText("댓글 80")).toBeInTheDocument();
    expect(within(region).getByText("댓글 81")).toBeInTheDocument();
    expect(within(region).getAllByTestId("comment-body")).toHaveLength(22);
  });

  it("더 보기로 읽은 옛 댓글에 단 리액션은 본문을 고친 뒤에도 남는다", async () => {
    const user = userEvent.setup();
    seedComments(25);
    const region = await openComments();
    await within(region).findByText("댓글 24");
    await user.click(within(region).getByRole("button", { name: "이전 코멘트 5개 더 보기" }));
    await within(region).findByText("댓글 0");

    // 가장 오래된 댓글(오래된 순이라 첫 번째)의 리액션 바
    const firstBar = within(region).getAllByRole("group", { name: "댓글 리액션" })[0];
    await user.click(within(firstBar).getByRole("button", { name: "리액션 추가" }));
    await user.click(await screen.findByRole("menuitem", { name: "👍" }).catch(() => screen.findByRole("button", { name: "👍" })));
    expect(await within(firstBar).findByRole("button", { name: "👍 1" })).toBeInTheDocument();

    await user.click(within(region).getAllByRole("button", { name: "수정" })[0]);
    const editor = within(region).getByLabelText("코멘트 수정");
    await user.clear(editor);
    await user.type(editor, "고친 옛 댓글");
    await user.click(within(region).getByRole("button", { name: "저장" }));

    await within(region).findByText("고친 옛 댓글");
    const barAfter = within(region).getAllByRole("group", { name: "댓글 리액션" })[0];
    expect(within(barAfter).getByRole("button", { name: "👍 1" })).toBeInTheDocument();
  });

  it("인라인 댓글을 못 읽으면 빈 목록으로 삼키지 않고 실패와 다시 시도를 보인다", async () => {
    const user = userEvent.setup();
    seedComments(1);
    spies.listCommentThreads.mockImplementation(async (pageId: string, options?: { kind?: string }) => {
      if (options?.kind === "inline") throw new Error("일시 오류");
      return mockStore.listCommentThreads(pageId, options as never);
    });
    renderApp("/spaces/sp1/pages/pg1");
    expect(await screen.findByText(/인라인 댓글을 불러오지 못했습니다: 일시 오류/)).toBeInTheDocument();

    spies.listCommentThreads.mockImplementation(mockStore.listCommentThreads);
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.queryByText(/인라인 댓글을 불러오지 못했습니다/)).not.toBeInTheDocument());
  });

  it("목업도 깨진 커서를 거부한다(형식만 맞춘 빈 값·시각이 아닌 값)", async () => {
    seedComments(2);
    for (const bad of ["~", "잘못된시각~cm-001", "2026-01-01T00:00:00.000Z~"]) {
      await expect(mockStore.listCommentThreads("pg1", { before: bad })).rejects.toThrow(
        "댓글 목록 커서가 올바르지 않습니다",
      );
    }
  });
});
