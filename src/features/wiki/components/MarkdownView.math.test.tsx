import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownView } from "./MarkdownView";
import { parseMarkdown, serializeMarkdown } from "../editor/markdown";

/** 수식 렌더(W27-2) — remark-math + rehype-katex. 편집기는 `$`를 텍스트로만 보존한다. */
describe("MarkdownView 수식", () => {
  it("블록 수식($$ 세 줄)을 KaTeX display로 렌더한다", () => {
    const { container } = render(<MarkdownView markdown={"$$\nE = mc^2\n$$"} />);
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("인라인 수식(한 줄 $$…$$)을 KaTeX로 렌더한다 (display가 아니다)", () => {
    const { container } = render(<MarkdownView markdown={"인라인 $$a^2 + b^2 = c^2$$ 수식"} />);
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector(".katex-display")).toBeNull();
  });

  it("홑 $는 수식이 아니다 — 가격 표기가 있는 문장이 그대로 남는다", () => {
    const { container } = render(<MarkdownView markdown={"가격은 $5 에서 $10 입니다"} />);
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("가격은 $5 에서 $10 입니다");
  });

  it("편집기 왕복으로 한 줄이 된 블록 수식도 display로 되돌린다 (remarkDisplayMath)", () => {
    const roundTripped = serializeMarkdown(parseMarkdown("$$\nE = mc^2\n$$"));
    // 편집기는 세 줄을 한 문단으로 접는다 — 그래서 저장형은 한 줄이다
    expect(roundTripped.trim()).toBe("$$ E = mc^2 $$");

    const { container } = render(<MarkdownView markdown={roundTripped} />);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("문장 속 인라인 수식은 문단이 통째로 수식이 아니므로 display로 승격하지 않는다", () => {
    const { container } = render(<MarkdownView markdown={"앞말 $$x$$ 뒷말"} />);
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector(".katex-display")).toBeNull();
  });

  it("코드 블록 안의 $$는 수식으로 해석하지 않는다", () => {
    const { container } = render(<MarkdownView markdown={"```ts\nconst price = `$$${n}`;\n```"} />);
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.querySelector("pre code")).not.toBeNull();
  });
});
