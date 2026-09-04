import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownView } from "./MarkdownView";

// mermaid는 실제 렌더에 브라우저 레이아웃(getBBox 등)이 필요해 jsdom에서 돌지 않는다 —
// 이 테스트가 확인하는 것은 "우리 쪽 배선"이다: 지연 로드 → 테마 전달 → SVG 주입 → 실패 폴백.
const { initializeMock, renderMock } = vi.hoisted(() => ({
  initializeMock: vi.fn(),
  renderMock: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: { initialize: initializeMock, render: renderMock } }));

const DIAGRAM = "```mermaid\ngraph TD;\n  A-->B;\n```";

beforeEach(() => {
  initializeMock.mockReset();
  renderMock.mockReset();
  renderMock.mockImplementation(async (_id: string, code: string) => {
    if (code.includes("!!!")) throw new Error("Parse error on line 1");
    return { svg: '<svg class="mermaid-svg"><title>다이어그램</title></svg>' };
  });
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

/** Mermaid 다이어그램 보기 렌더(W27-2) */
describe("MarkdownView Mermaid", () => {
  it("mermaid 코드 블록을 코드가 아니라 다이어그램 SVG로 렌더한다", async () => {
    const { container } = render(<MarkdownView markdown={DIAGRAM} />);

    expect(await screen.findByTitle("다이어그램")).toBeInTheDocument();
    expect(container.querySelector(".md-mermaid svg")).not.toBeNull();
    // 코드 블록으로 남지 않는다 — 하이라이터도 이 블록을 보지 않는다
    expect(container.querySelector("pre code")).toBeNull();
    expect(renderMock).toHaveBeenCalledWith(expect.any(String), "graph TD;\n  A-->B;");
  });

  it("문법 오류면 오류 문구와 원문 코드 블록으로 폴백한다", async () => {
    const { container } = render(<MarkdownView markdown={"```mermaid\n!!! 잘못된 문법\n```"} />);

    expect(await screen.findByText(/Mermaid 다이어그램을 그리지 못했습니다/)).toBeInTheDocument();
    expect(container.querySelector(".md-mermaid.is-broken pre code")).toHaveTextContent("!!! 잘못된 문법");
  });

  it("다크 테마면 mermaid theme을 dark로 초기화한다", async () => {
    document.documentElement.dataset.theme = "dark";
    render(<MarkdownView markdown={DIAGRAM} />);

    await screen.findByTitle("다이어그램");
    expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
  });

  it("라이트 테마면 mermaid theme을 default로 초기화한다", async () => {
    document.documentElement.dataset.theme = "light";
    render(<MarkdownView markdown={DIAGRAM} />);

    await screen.findByTitle("다이어그램");
    expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({ theme: "default" }));
  });

  it("다이어그램이 없는 문서는 mermaid를 부르지 않는다 (지연 로드)", () => {
    render(<MarkdownView markdown={"```ts\nconst a = 1;\n```"} />);
    expect(renderMock).not.toHaveBeenCalled();
  });
});
