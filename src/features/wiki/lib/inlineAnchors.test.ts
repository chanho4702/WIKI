import { beforeEach, describe, expect, it } from "vitest";
import { anchorFromSelection, applyHighlights, clearHighlights, offsetOfOccurrence } from "./inlineAnchors";

function container(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("W21-4 인라인 앵커", () => {
  it("n번째 등장의 오프셋을 찾고, 없으면 -1을 준다", () => {
    const text = "배포는 금요일. 배포는 금요일.";

    expect(offsetOfOccurrence(text, "금요일", 0)).toBe(4);
    expect(offsetOfOccurrence(text, "금요일", 1)).toBe(text.lastIndexOf("금요일"));
    expect(offsetOfOccurrence(text, "금요일", 2)).toBe(-1);
    expect(offsetOfOccurrence(text, "화요일", 0)).toBe(-1);
  });

  it("지정한 등장만 하이라이트한다", () => {
    const root = container("<p>배포는 금요일. 배포는 금요일.</p>");

    const found = applyHighlights(root, [{ id: "c1", quote: "금요일", occurrence: 1, replyCount: 0 }]);

    expect(found).toEqual(new Set(["c1"]));
    const marks = root.querySelectorAll("mark[data-comment-id='c1']");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("금요일");
    // 두 번째 등장이어야 한다 — 첫 번째는 그대로 남는다
    expect(root.textContent).toBe("배포는 금요일. 배포는 금요일.");
    expect(root.innerHTML.indexOf("<mark")).toBeGreaterThan(root.innerHTML.indexOf("금요일"));
  });

  /** 서식을 가로지르는 선택은 흔하다 — 한 노드 안에서만 찾으면 대부분의 인용을 놓친다. */
  it("서식을 가로지르는 구간도 조각마다 감싼다", () => {
    const root = container("<p>배포는 <strong>금요일</strong>에 한다</p>");

    const found = applyHighlights(root, [
      { id: "c1", quote: "배포는 금요일에", occurrence: 0, replyCount: 0 },
    ]);

    expect(found).toEqual(new Set(["c1"]));
    const marks = root.querySelectorAll("mark[data-comment-id='c1']");
    expect(marks.length).toBeGreaterThan(1);
    expect([...marks].map((m) => m.textContent).join("")).toBe("배포는 금요일에");
  });

  it("찾지 못한 앵커는 결과에 넣지 않는다 — 화면이 '위치 없음'으로 표시한다", () => {
    const root = container("<p>배포는 금요일에 한다</p>");

    const found = applyHighlights(root, [
      { id: "c1", quote: "금요일", occurrence: 0, replyCount: 0 },
      { id: "c2", quote: "화요일", occurrence: 0, replyCount: 0 },
    ]);

    expect(found).toEqual(new Set(["c1"]));
  });

  it("하이라이트를 걷어내면 원래 마크업으로 돌아온다", () => {
    const root = container("<p>배포는 금요일에 한다</p>");
    applyHighlights(root, [{ id: "c1", quote: "금요일", occurrence: 0, replyCount: 0 }]);

    clearHighlights(root);

    expect(root.querySelectorAll("mark")).toHaveLength(0);
    expect(root.innerHTML).toBe("<p>배포는 금요일에 한다</p>");
  });
});

/** 나중에 붙는 장식(ALM 스마트 링크 제목·상태)은 앵커 텍스트가 아니다(W3 리뷰 I1). */
describe("앵커 텍스트에서 빠지는 영역(data-anchor-ignore)", () => {
  const PLAIN = '<p>참고 <a href="/alm/browse/ALM-1">ALM-1</a> 다음 문장</p>';
  const SMART =
    '<p>참고 <a href="/alm/browse/ALM-1"><span>ALM-1</span><span data-anchor-ignore=""> 다음 <span>진행 중</span></span></a> 다음 문장</p>';

  it.each([
    ["원래 링크", PLAIN],
    ["스마트 링크", SMART],
  ])("%s에서 링크를 가로지르는 인용을 같은 텍스트로 찾는다", (_name, html) => {
    const root = container(html);

    const found = applyHighlights(root, [{ id: "c1", quote: "ALM-1 다음", occurrence: 0, replyCount: 0 }]);

    expect(found).toEqual(new Set(["c1"]));
    const marks = [...root.querySelectorAll("mark[data-comment-id='c1']")];
    expect(marks.map((m) => m.textContent).join("")).toBe("ALM-1 다음");
    // 장식 안(제목에 같은 낱말 "다음")은 칠하지 않는다 — 등장 순번이 밀리지 않는다
    expect(root.querySelector("[data-anchor-ignore] mark")).toBeNull();
  });

  it("장식에 걸친 선택은 장식 글자를 뺀 앵커 텍스트로 인용을 만든다", () => {
    const root = container(SMART);
    const key = root.querySelector("a span")!.firstChild as Text;
    const tail = root.querySelector("p")!.lastChild as Text; // " 다음 문장"
    const range = document.createRange();
    range.setStart(key, 0);
    range.setEnd(tail, 3); // " 다음"까지
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(anchorFromSelection(root)).toEqual({ quote: "ALM-1 다음", occurrence: 0 });
  });
});

describe("clearHighlights", () => {
  it("걷은 mark 수를 준다 — 0이면 DOM을 건드리지 않았다", () => {
    const root = container("<p>배포는 금요일에 한다</p>");
    expect(clearHighlights(root)).toBe(0);

    applyHighlights(root, [{ id: "c1", quote: "금요일", occurrence: 0, replyCount: 0 }]);

    expect(clearHighlights(root)).toBe(1);
    expect(root.querySelector("mark")).toBeNull();
    expect(root.textContent).toBe("배포는 금요일에 한다");
  });
});
