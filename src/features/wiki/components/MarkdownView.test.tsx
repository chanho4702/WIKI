import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownView } from "./MarkdownView";
import { parseMarkdown, serializeMarkdown } from "../editor/markdown";

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

  it("heading에 rehype-slug가 id를 부여한다 (TableOfContents #slug 앵커의 전제)", () => {
    render(<MarkdownView markdown={["# 개발 위키에 오신 것을 환영합니다", "## 시작 순서"].join("\n")} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute(
      "id",
      "개발-위키에-오신-것을-환영합니다",
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("id", "시작-순서");
  });

  it("마커 없는 일반 인용구는 blockquote로 그대로 렌더한다 (안전 열화 확인)", () => {
    const { container } = render(<MarkdownView markdown={"> 그냥 인용문입니다."} />);
    expect(container.querySelector(".md-alert")).toBeNull();
    expect(container.querySelector("blockquote")).not.toBeNull();
    expect(container.querySelector("blockquote")).toHaveTextContent("그냥 인용문입니다.");
  });

  // 리뷰어 Important 1 — 실제 저장 문자열은 tiptap-markdown이 "["를 이스케이프한
  // "> \[!NOTE\] ..." 형태다(이스케이프 없는 입력은 이 테스트 파일 어디에서도 실제 저장형이 아니다).
  // remark-parse는 파싱 시점에 백슬래시 이스케이프를 리터럴로 되돌리므로 remarkAlerts가 정상 인식한다.
  it("이스케이프 저장형(\\[!NOTE\\])도 md-alert-note 패널로 렌더한다 (실제 저장 문자열 검증)", () => {
    const escaped = "> \\[!NOTE\\] 내용";
    const { container } = render(<MarkdownView markdown={escaped} />);
    const panel = container.querySelector(".md-alert.md-alert-note");
    expect(panel).not.toBeNull();
    expect(panel).toHaveTextContent("노트");
    expect(panel).toHaveTextContent("내용");
  });

  // 리뷰어 Important 1(b) — "에디터 왕복 후에도 패널 유지" 계약의 유일한 실증.
  // 사용자가 이스케이프 없이 "[!NOTE]"를 타이핑/붙여넣기 해도, 에디터에 한 번 통과시키면
  // (parseMarkdown → serializeMarkdown) tiptap-markdown이 저장형을 이스케이프로 정규화하고,
  // 그 결과를 MarkdownView에 렌더해도 여전히 패널로 보여야 한다.
  it("비이스케이프 입력이 에디터 왕복(파싱→직렬화) 후에도 패널로 유지된다 (실사용 시나리오)", () => {
    const typed = "> [!NOTE] 내용";
    const roundTripped = serializeMarkdown(parseMarkdown(typed));
    expect(roundTripped.trim()).toBe("> \\[!NOTE\\] 내용"); // 정규화되어 이스케이프됨을 함께 확인

    const { container } = render(<MarkdownView markdown={roundTripped} />);
    const panel = container.querySelector(".md-alert.md-alert-note");
    expect(panel).not.toBeNull();
    expect(panel).toHaveTextContent("노트");
    expect(panel).toHaveTextContent("내용");
  });

  it("언어가 명시된 코드 블록(```ts)에 rehype-highlight가 hljs- 토큰 클래스를 부여한다", () => {
    const md = ["```ts", "const answer = 42;", "```"].join("\n");
    const { container } = render(<MarkdownView markdown={md} />);

    // hljs- 클래스를 가진 토큰 span이 존재하는지 확인
    const tokenSpans = container.querySelectorAll("[class^='hljs-']");
    expect(tokenSpans.length).toBeGreaterThan(0);

    // 코드 블록의 구조는 유지되는지 확인
    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code).toHaveTextContent("const answer = 42;");
  });

  it("언어가 없는 코드 블록은 하이라이트되지 않는다 (detect: false 검증)", () => {
    const md = ["```", "const answer = 42;", "```"].join("\n");
    const { container } = render(<MarkdownView markdown={md} />);

    // hljs- 클래스를 가진 토큰이 없어야 함 (detect:false로 인해 하이라이트 안 됨)
    const tokenSpans = container.querySelectorAll("[class^='hljs-']");
    expect(tokenSpans.length).toBe(0);

    // 하지만 코드 블록 자체는 존재해야 함
    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code).toHaveTextContent("const answer = 42;");
  });
});
