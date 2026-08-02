import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownView } from "./MarkdownView";
import { CodeLineNumbers } from "./CodeLineNumbers";

describe("CodeLineNumbers", () => {
  it("줄 수만큼 번호를 그리고 접근성 트리에서는 감춘다", () => {
    const { container } = render(<CodeLineNumbers code={"a\nb\nc"} />);
    const gutter = container.querySelector(".code-line-numbers");
    expect(gutter).toHaveAttribute("aria-hidden", "true");
    expect(gutter?.textContent).toBe("123");
  });
});

/**
 * B1의 핵심 계약 — 줄 번호가 복사물에 섞이지 않는 것.
 *
 * 보기 화면의 복사는 `pre.textContent`를 읽고, 사용자가 드래그로 긁어도 `<pre>` 안의 텍스트가
 * 잡힌다. 거터를 `<pre>` 안에 넣으면 붙여넣기가 "1const x…"가 된다 — 구조로 막아야 하는 부분이라
 * DOM 위치 자체를 검증한다.
 */
describe("보기 화면 코드 블록 — 줄 번호와 복사 원문 분리", () => {
  const MD = ["```ts", "const a = 1;", "const b = 2;", "```"].join("\n");

  it("줄 번호는 <pre> 바깥에 있다 — pre.textContent에 번호가 섞이지 않는다", () => {
    const { container } = render(<MarkdownView markdown={MD} />);
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.querySelector(".code-line-numbers")).toBeNull();
    // 복사가 읽는 바로 그 값
    expect(pre!.textContent).toContain("const a = 1;");
    expect(pre!.textContent).not.toMatch(/^1/);
  });

  it("보기 화면에도 줄 번호가 나온다 — 편집 화면 전용이 아니다", () => {
    const { container } = render(<MarkdownView markdown={MD} />);
    const gutter = container.querySelector(".code-line-numbers");
    expect(gutter).not.toBeNull();
    expect(gutter?.textContent).toBe("12");
  });

  it("복사 버튼은 그대로 동작한다(회귀)", () => {
    render(<MarkdownView markdown={MD} />);
    expect(screen.getByRole("button", { name: "코드 복사" })).toBeInTheDocument();
  });
});
