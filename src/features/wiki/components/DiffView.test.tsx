import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiffView } from "./DiffView";

describe("DiffView", () => {
  it("트레일링 개행이 가짜 빈 라인을 만들지 않는다", () => {
    render(<DiffView oldText={"a\n"} newText={"b\n"} />);
    const lines = screen.getByTestId("diff-view").querySelectorAll(".diff-line");
    expect([...lines].map((el) => el.textContent)).toEqual(["a", "b"]);
  });

  it("둘 다 빈 텍스트면 '내용 없음'을 보여준다", () => {
    render(<DiffView oldText="" newText="" />);
    expect(screen.getByText("내용 없음")).toBeInTheDocument();
  });
});
