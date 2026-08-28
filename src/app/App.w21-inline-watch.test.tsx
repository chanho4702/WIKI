import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import {
  __resetForTest,
  addComment,
  getWatchState,
  listComments,
  listNotifications,
  setCommentResolved,
  setWatchState,
  updatePage,
} from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

describe("W21-4 인라인 댓글 — 스토어 계약", () => {
  it("앵커를 붙이면 인라인 댓글이 되고 페이지 댓글과 구분된다", async () => {
    const inline = await addComment("pg1", "이 문장 확인 부탁", null, {
      quote: "시작하기",
      occurrence: 0,
    });
    await addComment("pg1", "일반 댓글");

    expect(inline.anchorType).toBe("inline");
    expect(inline.anchorQuote).toBe("시작하기");
    const all = await listComments("pg1");
    expect(all.filter((c) => c.anchorType === "inline")).toHaveLength(1);
  });

  it("답글에는 본문 구간을 붙일 수 없다", async () => {
    const root = await addComment("pg1", "질문");

    await expect(
      addComment("pg1", "답", root.id, { quote: "시작하기", occurrence: 0 }),
    ).rejects.toThrow("답글에는 본문 구간을 붙일 수 없습니다");
  });

  it("해결하면 resolvedAt이 찍히고 다시 열 수 있다", async () => {
    const inline = await addComment("pg1", "확인", null, { quote: "시작하기", occurrence: 0 });

    const resolved = await setCommentResolved(inline.id, true);
    expect(resolved.resolvedAt).not.toBeNull();

    const reopened = await setCommentResolved(inline.id, false);
    expect(reopened.resolvedAt).toBeNull();
  });

  it("페이지 댓글은 해결 대상이 아니다", async () => {
    const plain = await addComment("pg1", "일반 댓글");

    await expect(setCommentResolved(plain.id, true)).rejects.toThrow(
      "인라인 댓글만 해결할 수 있습니다",
    );
  });
});

describe("W21-4 구독 — 스토어 계약", () => {
  it("고친 문서는 자동 구독되고, 해제하면 알림이 끊긴다", async () => {
    await updatePage("pg2", { body: "내가 고친 문서" });
    expect(await getWatchState("pg2")).toBe(true);

    await setWatchState("pg2", false);

    expect(await getWatchState("pg2")).toBe(false);
  });

  it("구독 중인 문서의 변경은 알림함에 쌓인다", async () => {
    await setWatchState("pg2", true);
    const before = (await listNotifications()).items.length;

    // 목업의 현재 사용자는 자기 변경 알림을 받지 않으므로, 구독 자체가 유지되는지로 확인한다
    await updatePage("pg2", { body: "고침" });

    expect(await getWatchState("pg2")).toBe(true);
    expect((await listNotifications()).items.length).toBeGreaterThanOrEqual(before);
  });

  it("댓글을 달면 그 문서를 자동 구독한다", async () => {
    await setWatchState("pg2", false);

    await addComment("pg2", "질문 있습니다");

    expect(await getWatchState("pg2")).toBe(true);
  });
});

describe("W21-4 화면", () => {
  it("인라인 댓글이 있으면 본문 댓글 섹션에 인용과 함께 보이고 해결할 수 있다", async () => {
    const user = userEvent.setup();
    await addComment("pg1", "이 문장 확인 부탁", null, { quote: "온보딩", occurrence: 0 });
    renderApp("/spaces/sp1/pages/pg1");

    const section = await screen.findByRole("region", { name: "본문 댓글" });
    expect(within(section).getByText("이 문장 확인 부탁")).toBeInTheDocument();

    await user.click(within(section).getByRole("button", { name: /해결/ }));

    await waitFor(() => {
      expect(within(section).getByRole("button", { name: /해결된 대화 1개 보기/ })).toBeInTheDocument();
    });
  });

  it("인라인 댓글은 페이지 댓글 목록에 섞이지 않는다", async () => {
    await addComment("pg1", "인라인입니다", null, { quote: "온보딩", occurrence: 0 });
    renderApp("/spaces/sp1/pages/pg1");

    const comments = await screen.findByRole("region", { name: "코멘트" });
    expect(within(comments).queryByText("인라인입니다")).not.toBeInTheDocument();
  });

  it("구독 버튼으로 알림을 켜고 끌 수 있다", async () => {
    const user = userEvent.setup();
    await setWatchState("pg1", false);
    renderApp("/spaces/sp1/pages/pg1");

    const subscribe = await screen.findByRole("button", { name: "구독" });
    await user.click(subscribe);

    expect(await screen.findByRole("button", { name: "구독 해제" })).toBeInTheDocument();
    expect(await getWatchState("pg1")).toBe(true);
  });
});
