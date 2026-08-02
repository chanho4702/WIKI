import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SuggestionPopup } from "./SuggestionPopup";

/**
 * 위치 보정 검증. 실제로 났던 문제는 "문서 하단에서 `/`를 치면 메뉴가 화면 아래로 숨는다"였다 —
 * position:fixed라 스크롤로도 못 따라가서 항목을 아예 고를 수 없었다.
 *
 * jsdom은 레이아웃을 하지 않아 getBoundingClientRect가 전부 0을 준다. 뒤집기 판단이 팝업 크기에
 * 달려 있으므로 크기를 직접 심어준다.
 */
function stubPopupSize(width: number, height: number) {
  const spy = vi
    .spyOn(HTMLUListElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  return spy;
}

const ITEMS = [
  { id: "h1", label: "제목 1" },
  { id: "h2", label: "제목 2" },
];

function renderAt(anchor: { top: number; bottom: number; left: number }) {
  render(
    <SuggestionPopup ariaLabel="블록 삽입 메뉴" items={ITEMS} highlight={0} anchor={anchor} onPick={() => {}} />,
  );
  return screen.getByRole("listbox", { name: "블록 삽입 메뉴" });
}

describe("SuggestionPopup 위치 보정", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("아래에 자리가 있으면 캐럿 아래에 그린다", () => {
    stubPopupSize(220, 200);
    // 뷰포트 768 기준 한참 위 — 200px 목록이 그대로 들어간다
    const list = renderAt({ top: 100, bottom: 120, left: 40 });

    expect(list).toHaveStyle({ top: "124px" }); // bottom + GAP(4)
    expect(list).toHaveStyle({ left: "40px" });
  });

  it("아래 공간이 모자라면 캐럿 위로 뒤집는다", () => {
    stubPopupSize(220, 200);
    // 캐럿이 문서 하단(bottom 740) — 740+4+200=944 > 768이라 아래로는 못 그린다
    const list = renderAt({ top: 720, bottom: 740, left: 40 });

    // top(720) - GAP(4) - height(200) = 516
    expect(list).toHaveStyle({ top: "516px" });
  });

  it("위아래 어디에도 안 들어가면 뷰포트 안으로 밀어넣는다", () => {
    // 창이 짧아 목록(700)이 위로 뒤집어도 안 들어간다 — 화면 밖으로 내보내지 않는다
    stubPopupSize(220, 700);
    const list = renderAt({ top: 300, bottom: 320, left: 40 });

    // max(MARGIN 8, vh 768 - MARGIN 8 - height 700) = 60
    expect(list).toHaveStyle({ top: "60px" });
  });

  it("오른쪽 경계에서 가로로 잘리지 않게 clamp한다", () => {
    stubPopupSize(220, 100);
    // 뷰포트 1024, 캐럿이 오른쪽 끝(1000) — 그대로 두면 목록이 오른쪽으로 넘친다
    const list = renderAt({ top: 100, bottom: 120, left: 1000 });

    // min(1000, 1024 - MARGIN 8 - width 220) = 796
    expect(list).toHaveStyle({ left: "796px" });
  });
});
