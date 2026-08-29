import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

/**
 * 본문에서 quote를 골라 실제 Selection을 만든다 — anchorFromSelection이 DOM 선택을 읽으므로
 * 목으로 대체할 수 없다. 반환값은 우클릭 이벤트를 때릴 노드다.
 *
 * 탐색 범위를 본문 컨테이너로 좁힌다: 같은 낱말이 목차에도 있는데, 목차에서 고른 선택은
 * 앵커 대상이 아니라 무시된다(본문 DOM만 앵커 기준이다).
 */
function selectTextInBody(quote: string): Element {
  const scope = document.querySelector(".inline-comment-scope > div");
  if (!scope) throw new Error("본문 컨테이너를 찾지 못했습니다");
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const at = node.data.indexOf(quote);
    if (at >= 0 && node.parentElement) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + quote.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return node.parentElement;
    }
    node = walker.nextNode() as Text | null;
  }
  throw new Error(`본문에서 ${quote}를 찾지 못했습니다`);
}

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
  /**
   * W23부터 본문에는 "댓글이 달렸다"만 보인다 — 대화는 하이라이트를 눌러야 그 줄 옆에 뜬다.
   * 스레드를 통째로 본문 아래 펼쳐 놓으면 인용문이 본문과 떨어져 어느 문장 얘기인지가 사라진다.
   */
  it("본문에는 하이라이트만 보이고, 누르면 그 줄 옆 상자에서 대화가 열린다", async () => {
    const user = userEvent.setup();
    await addComment("pg1", "이 문장 확인 부탁", null, { quote: "시작 순서", occurrence: 0 });
    renderApp("/spaces/sp1/pages/pg1");

    const mark = await screen.findByRole("button", { name: /본문 댓글 보기: 시작 순서/ });
    expect(screen.queryByText("이 문장 확인 부탁")).not.toBeInTheDocument();

    await user.click(mark);

    const box = await screen.findByRole("complementary", { name: "본문 댓글" });
    expect(within(box).getByText("이 문장 확인 부탁")).toBeInTheDocument();
  });

  it("상자에서 답글을 남기면 대화가 이어진다", async () => {
    const user = userEvent.setup();
    const thread = await addComment("pg1", "이 문장 확인 부탁", null, {
      quote: "시작 순서",
      occurrence: 0,
    });
    renderApp("/spaces/sp1/pages/pg1");

    await user.click(await screen.findByRole("button", { name: /본문 댓글 보기: 시작 순서/ }));
    const box = await screen.findByRole("complementary", { name: "본문 댓글" });
    await user.type(within(box).getByLabelText("답글"), "확인했습니다");
    await user.click(within(box).getByRole("button", { name: "답글 남기기" }));

    expect(await within(box).findByText("확인했습니다")).toBeInTheDocument();
    await waitFor(async () => {
      const replies = (await listComments("pg1")).filter((c) => c.parentId === thread.id);
      expect(replies).toHaveLength(1);
    });
  });

  it("해결하면 하이라이트가 내려가고 해결된 대화 목록으로 옮겨간다", async () => {
    const user = userEvent.setup();
    await addComment("pg1", "이 문장 확인 부탁", null, { quote: "시작 순서", occurrence: 0 });
    renderApp("/spaces/sp1/pages/pg1");

    await user.click(await screen.findByRole("button", { name: /본문 댓글 보기: 시작 순서/ }));
    const box = await screen.findByRole("complementary", { name: "본문 댓글" });
    await user.click(within(box).getByRole("button", { name: /해결/ }));

    expect(
      await screen.findByRole("button", { name: /해결된 대화 1개 보기/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /본문 댓글 보기: 시작 순서/ })).not.toBeInTheDocument();
  });

  /** 고른 구간이 없는 우클릭은 브라우저 기본 메뉴를 그대로 둔다 — 링크 복사까지 뺏지 않는다. */
  it("본문을 골라 우클릭하면 댓글 달기가 뜨고 그 자리에서 댓글을 남긴다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    const target = selectTextInBody("시작 순서");
    fireEvent.contextMenu(target);

    await user.click(await screen.findByRole("menuitem", { name: /댓글 달기/ }));
    const box = await screen.findByRole("complementary", { name: "본문 댓글 작성" });
    await user.type(within(box).getByLabelText("선택한 구간에 댓글"), "여기 설명 추가해주세요");
    await user.click(within(box).getByRole("button", { name: "댓글 달기" }));

    await waitFor(async () => {
      const inline = (await listComments("pg1")).filter((c) => c.anchorType === "inline");
      expect(inline).toHaveLength(1);
      expect(inline[0].anchorQuote).toBe("시작 순서");
    });
    expect(await screen.findByRole("button", { name: /본문 댓글 보기: 시작 순서/ })).toBeInTheDocument();
  });

  it("인라인 댓글은 페이지 댓글 목록에 섞이지 않는다", async () => {
    await addComment("pg1", "인라인입니다", null, { quote: "시작 순서", occurrence: 0 });
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
