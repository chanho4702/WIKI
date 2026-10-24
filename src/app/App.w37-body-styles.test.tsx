import { describe, expect, it } from "vitest";
// CSS 소스 검사 — jsdom은 레이아웃을 계산하지 않아 줄 높이·여백을 렌더로 확인할 수 없다(App.w7-dark-theme와 같은 패턴).
import css from "./app.css?raw";

/** 셀렉터 목록에 `selector`가 그대로 들어 있는 첫 규칙의 본문(주석은 걷어 낸다) */
function ruleBody(selector: string): string {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of source.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = match[1].split(",").map((s) => s.trim());
    if (selectors.includes(selector)) return match[2];
  }
  throw new Error(`규칙 없음: ${selector}`);
}

/* 컨플 본문 스타일 보완(2026-10-24) — 근거는 @atlaskit/editor-core EditorContentContainer CSS */
describe("본문·편집기 블록 스타일 (CSS 소스 검사)", () => {
  it("코드 블록: <pre>와 줄 번호 거터가 같은 글꼴 크기·고정 줄 높이를 쓴다(보기에서 번호가 줄과 어긋나던 결함)", () => {
    const lineHeight = /--wiki-code-line-height:\s*([^;]+);/.exec(css)?.[1].trim();
    // 단위 없는 배수면 요소마다 자기 글꼴 크기로 다시 계산돼 행 높이가 갈린다
    expect(lineHeight).toMatch(/^\d+(\.\d+)?(px|rem)$/);
    expect(ruleBody(".markdown-body pre")).toContain("font-size: var(--chanho-font-size-100)");
    expect(ruleBody(".code-line-numbers")).toContain("font-size: var(--chanho-font-size-100)");
  });

  it("할 일 목록: 글머리표 없이 체크박스와 글자가 한 줄이다(보기·편집기)", () => {
    expect(ruleBody(".markdown-body ul.contains-task-list")).toContain("list-style: none");
    expect(ruleBody('.wiki-editor .ProseMirror ul[data-type="taskList"] > li')).toContain("display: flex");
    expect(ruleBody('.wiki-editor .ProseMirror ul[data-type="taskList"] > li > div > p')).toContain("margin: 0");
  });

  it("표: 칸 안 문단 여백을 없애 편집기 칸이 보기와 같은 높이다", () => {
    // :is(th, td) 안의 쉼표 때문에 셀렉터 목록 분리 대신 규칙을 통째로 대조한다
    expect(css).toMatch(/\.wiki-editor \.ProseMirror :is\(th, td\) > p \{\s*margin: 0;/);
  });

  it("패널: 왼쪽 강조선 없이 배경과 아이콘으로만 구분한다(컨플 패널)", () => {
    const panel = ruleBody(".markdown-body .md-alert");
    expect(panel).not.toMatch(/border-left/);
    expect(css).not.toMatch(/\.md-alert-[a-z]+[^{]*\{[^}]*border-left-color/);
  });
});
