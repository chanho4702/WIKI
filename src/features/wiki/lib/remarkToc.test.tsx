import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownView } from "../components/MarkdownView";
import { parseMarkdown, serializeMarkdown } from "../editor/markdown";

const DOC = ["# 큰 제목", "", "::toc", "", "## 첫 절", "본문", "", "## 둘째 절", "본문"].join("\n");

describe("본문 목차 (::toc)", () => {
  it("::toc 자리에 목차가 렌더된다", () => {
    render(<MarkdownView markdown={DOC} />);
    const toc = screen.getByRole("navigation", { name: "목차" });
    expect(toc).toBeInTheDocument();
    expect(toc).toHaveTextContent("첫 절");
    expect(toc).toHaveTextContent("둘째 절");
  });

  it("목차 링크가 heading의 slug를 가리킨다 — 눌러서 실제로 이동해야 한다", () => {
    const { container } = render(<MarkdownView markdown={DOC} />);
    const link = screen.getByRole("link", { name: "첫 절" });
    const href = link.getAttribute("href")!;
    expect(href.startsWith("#")).toBe(true);
    // rehype-slug가 붙인 실제 heading id와 일치해야 한다(둘이 갈리면 링크가 죽는다)
    expect(container.querySelector(href)).not.toBeNull();
  });

  it("편집기 왕복 후에도 목차로 남는다", () => {
    // 편집기(markdown-it)는 ::toc를 모른다 — 텍스트 문단으로 남았다가 다시 저장된다.
    // 직렬화기가 콜론을 이스케이프하면(\:\:toc) 보기 쪽 파싱이 깨지므로 그 경로를 고정한다.
    const roundtripped = serializeMarkdown(parseMarkdown(DOC));
    render(<MarkdownView markdown={roundtripped} />);
    expect(screen.getByRole("navigation", { name: "목차" })).toHaveTextContent("첫 절");
  });

  it("제목이 없으면 왜 비었는지 알려준다 — 넣었는데 아무것도 안 보이면 고장으로 읽힌다", () => {
    render(<MarkdownView markdown={"::toc\n\n본문만 있습니다."} />);
    expect(screen.getByRole("navigation", { name: "목차" })).toHaveTextContent(
      "제목을 추가하면 목차가 만들어집니다.",
    );
  });

  it("::toc가 없는 문서에는 본문 목차가 생기지 않는다", () => {
    render(<MarkdownView markdown={"# 제목\n\n## 절\n본문"} />);
    expect(screen.queryByRole("navigation", { name: "목차" })).not.toBeInTheDocument();
  });
});
