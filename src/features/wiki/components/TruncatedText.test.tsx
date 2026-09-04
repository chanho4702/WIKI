import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TruncatedText, applyOverflowTitle, overflowTitleProps } from "./TruncatedText";

/** jsdom은 레이아웃을 계산하지 않아 두 값이 늘 0이다 — 넘침 여부를 직접 심는다. */
function stubWidths(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
}

const LONG = "플랫폼 엔지니어링 파트 온보딩·운영 절차 통합 위키 (2026 하반기 개편판)";

describe("TruncatedText", () => {
  it("넘칠 때 hover하면 전체 이름이 title로 붙는다", async () => {
    render(<TruncatedText text={LONG} className="page-tree-label" />);
    const span = screen.getByText(LONG);
    stubWidths(span, 480, 200);

    await userEvent.hover(span);

    expect(span).toHaveAttribute("title", LONG);
  });

  it("넘치지 않으면 title을 달지 않는다 — 짧은 이름에 툴팁이 뜨면 소음이다", async () => {
    render(<TruncatedText text="개발팀" />);
    const span = screen.getByText("개발팀");
    stubWidths(span, 60, 200);

    await userEvent.hover(span);

    expect(span).not.toHaveAttribute("title");
  });

  it("자리별 클래스와 .wiki-truncate를 함께 단다", () => {
    render(<TruncatedText text="개발팀" className="home-space-card-name" />);
    const span = screen.getByText("개발팀");

    expect(span).toHaveClass("wiki-truncate");
    expect(span).toHaveClass("home-space-card-name");
  });

  it("폭이 넓어지면 이전에 붙은 title을 떼어 낸다", () => {
    render(<TruncatedText text={LONG} />);
    const span = screen.getByText(LONG);

    stubWidths(span, 480, 200);
    applyOverflowTitle(span, LONG);
    expect(span).toHaveAttribute("title", LONG);

    stubWidths(span, 480, 480);
    applyOverflowTitle(span, LONG);
    expect(span).not.toHaveAttribute("title");
  });
});

describe("overflowTitleProps", () => {
  it("감쌀 수 없는 요소(버튼)에도 같은 규칙을 적용한다", async () => {
    render(
      <button type="button" {...overflowTitleProps(LONG)}>
        {LONG}
      </button>,
    );
    const button = screen.getByRole("button");
    stubWidths(button, 480, 200);

    await userEvent.hover(button);

    expect(button).toHaveAttribute("title", LONG);
  });
});
