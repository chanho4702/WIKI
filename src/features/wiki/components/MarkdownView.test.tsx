import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownView } from "./MarkdownView";

describe("MarkdownView", () => {
  it("헤딩과 목록을 렌더한다", () => {
    render(<MarkdownView markdown={"# 제목\n\n- 항목 하나"} />);
    expect(screen.getByRole("heading", { level: 1, name: "제목" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("항목 하나");
  });

  it("GFM 표를 table 요소로 렌더한다 (remark-gfm 검증)", () => {
    const md = ["| 명령어 | 설명 |", "| --- | --- |", "| `pnpm test` | 테스트 실행 |"].join("\n");
    render(<MarkdownView markdown={md} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "명령어" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "테스트 실행" })).toBeInTheDocument();
  });

  it("코드블록을 pre > code로 렌더한다", () => {
    const md = ["```ts", "const answer = 42;", "```"].join("\n");
    const { container } = render(<MarkdownView markdown={md} />);
    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code).toHaveTextContent("const answer = 42;");
  });

  it("raw HTML은 렌더하지 않는다 (XSS 방어 — react-markdown 기본값 유지)", () => {
    render(<MarkdownView markdown={'<button onclick="alert(1)">클릭</button>'} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
