import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MarkdownView } from "./MarkdownView";
import { __resetPlatformFeaturesForTest } from "../store/platformApi";
import { __resetAlmIssueCardsForTest } from "../lib/useAlmIssueCards";
import { applyHighlights } from "../lib/inlineAnchors";

/**
 * 스마트 링크 × 인라인 댓글 앵커(W3 리뷰 I1·M1). 앵커는 렌더된 본문 텍스트의 n번째 등장이라,
 * 카드가 도착해 글자가 늘면 링크를 가로지르는 인용을 잃는다. 제목·상태는 앵커 텍스트에서 빠져야 한다.
 */

const ALM_1_NAME = "ALM-1 스마트 링크 카드 조회 API, 진행 중";
const BODY = "참고 [ALM-1](/alm/browse/ALM-1) 다음 문장. 스마트 링크 설명.";

beforeEach(() => {
  localStorage.clear();
  __resetPlatformFeaturesForTest();
  __resetAlmIssueCardsForTest();
});

function body(container: HTMLElement) {
  return container.querySelector(".markdown-body") as HTMLElement;
}

describe("MarkdownView 스마트 링크 — 인라인 댓글 앵커", () => {
  it("링크를 가로지르는 인용이 카드 도착 전후에 같은 자리에서 찾아진다", async () => {
    const { container } = render(<MarkdownView markdown={BODY} />);
    const targets = [
      { id: "across", quote: "ALM-1 다음", occurrence: 0, replyCount: 0 },
      // 카드 제목과 같은 낱말 — 제목이 앵커 텍스트에 섞이면 등장 순번이 밀려 엉뚱한 곳을 칠한다
      { id: "word", quote: "스마트 링크", occurrence: 0, replyCount: 0 },
    ];

    // 카드 도착 전(원래 링크)
    expect(screen.getByRole("link", { name: "ALM-1" })).not.toHaveClass("alm-smart-link");
    expect(applyHighlights(body(container), targets)).toEqual(new Set(["across", "word"]));
    const before = [...body(container).querySelectorAll("mark")].map((m) => m.textContent).join("|");

    // 카드 도착 후(스마트 링크)
    const link = await screen.findByRole("link", { name: ALM_1_NAME });
    expect(applyHighlights(body(container), targets)).toEqual(new Set(["across", "word"]));
    const after = [...body(container).querySelectorAll("mark")].map((m) => m.textContent).join("|");

    expect(after).toBe(before);
    // "스마트 링크"는 카드 제목이 아니라 본문 뒤쪽 문장에 칠해진다
    expect(link.querySelector("mark[data-comment-id='word']")).toBeNull();
  });

  it("스마트 링크 조각 사이에 공백 텍스트가 있다 — 복사·찾기 결과가 붙어 나오지 않는다", async () => {
    render(<MarkdownView markdown={BODY} />);

    const link = await screen.findByRole("link", { name: ALM_1_NAME });

    expect(link.textContent).toBe("ALM-1 스마트 링크 카드 조회 API 진행 중");
  });

  /**
   * 하이라이트가 칠해진 채로 카드가 도착하는 실제 순서. 예전엔 `mark`가 React 텍스트 노드를 감싼 채
   * React가 링크 자리를 바꿔 "child can not be found"로 본문이 통째로 사라졌다(리뷰 I1 재현 중 실측).
   * 이제 MarkdownView가 반영 직전에 걷어 내고, 반영 뒤 onDecorationsChange로 다시 칠할 때를 알린다.
   */
  it("하이라이트가 칠해진 채로 카드가 도착해도 본문이 깨지지 않고, 다시 칠하면 같은 자리다", async () => {
    const targets = [{ id: "across", quote: "ALM-1 다음", occurrence: 0, replyCount: 0 }];
    let root: HTMLElement | null = null;
    const repaint = vi.fn(() => {
      if (root) applyHighlights(root, targets);
    });
    const { container } = render(<MarkdownView markdown={BODY} onDecorationsChange={repaint} />);
    root = body(container);
    expect(applyHighlights(root, targets)).toEqual(new Set(["across"]));

    await screen.findByRole("link", { name: ALM_1_NAME });

    await waitFor(() => expect(repaint).toHaveBeenCalledTimes(1));
    expect(body(container).textContent).toContain("다음 문장");
    const marks = [...body(container).querySelectorAll("mark[data-comment-id='across']")];
    expect(marks.map((m) => m.textContent).join("")).toBe("ALM-1 다음");
  });

  it("카드 반영과 무관한 첫 렌더에는 onDecorationsChange를 부르지 않는다", async () => {
    const repaint = vi.fn();
    render(<MarkdownView markdown={"ALM 링크 없는 본문"} onDecorationsChange={repaint} />);

    await new Promise((r) => setTimeout(r, 0));
    expect(repaint).not.toHaveBeenCalled();
  });
});
