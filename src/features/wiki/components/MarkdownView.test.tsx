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

  it("[!NOTE] blockquote를 md-alert-note 패널로 렌더한다 (GitHub-style alerts, remarkAlerts 검증)", () => {
    const { container } = render(<MarkdownView markdown={"> [!NOTE] 참고할 내용"} />);
    const panel = container.querySelector(".md-alert.md-alert-note");
    expect(panel).not.toBeNull();
    expect(panel?.tagName).toBe("DIV");
    expect(panel).toHaveTextContent("노트");
    expect(panel).toHaveTextContent("참고할 내용");
  });

  it("마커 없는 일반 인용구는 blockquote로 그대로 렌더한다 (안전 열화 확인)", () => {
    const { container } = render(<MarkdownView markdown={"> 그냥 인용문입니다."} />);
    expect(container.querySelector(".md-alert")).toBeNull();
    expect(container.querySelector("blockquote")).not.toBeNull();
    expect(container.querySelector("blockquote")).toHaveTextContent("그냥 인용문입니다.");
  });
});
