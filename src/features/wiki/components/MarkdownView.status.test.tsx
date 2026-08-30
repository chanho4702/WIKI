import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownView } from "./MarkdownView";

/** 상태 배지·페이지 속성(W23). */
describe("MarkdownView 상태 배지", () => {
  it(":status 지시자를 배지로 그린다", () => {
    render(<MarkdownView markdown={"상태: :status[진행 중]{.info} 입니다"} />);

    const badge = screen.getByText("진행 중");
    expect(badge.closest(".md-status")).not.toBeNull();
  });

  /** 모르는 색 이름은 내용을 살리고 neutral로 — 내용이 사라지는 게 최악의 실패다. */
  it("모르는 색은 neutral로 그린다", () => {
    render(<MarkdownView markdown={":status[뭔가]{.purple}"} />);

    expect(screen.getByText("뭔가")).toBeInTheDocument();
  });

  it("편집기가 이스케이프한 인라인 지시자도 읽는다", () => {
    render(<MarkdownView markdown={"\\:status[완료]{.success}"} />);

    expect(screen.getByText("완료").closest(".md-status")).not.toBeNull();
  });

  it(":::properties 안의 표를 속성 판으로 감싼다", () => {
    const { container } = render(
      <MarkdownView markdown={":::properties\n| 항목 | 값 |\n| --- | --- |\n| 담당자 | 김철수 |\n:::"} />,
    );

    expect(container.querySelector(".md-properties table")).not.toBeNull();
    expect(screen.getByText("김철수")).toBeInTheDocument();
  });
});
