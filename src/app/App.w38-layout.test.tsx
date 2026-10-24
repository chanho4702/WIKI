import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
// CSS 소스 검사 — jsdom은 레이아웃을 계산하지 않아 겹침·넘침을 렌더로 확인할 수 없다(App.w37-body-styles와 같은 패턴).
// 근거 캡처·자동 겹침 검사 결과는 2026-10-24 UI/UX 전수 점검(겹침·잘림·가로 스크롤)에서 나왔다.
import css from "./app.css?raw";
import { MarkdownView } from "../features/wiki/components/MarkdownView";

const source = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** 가장 안쪽 규칙(본문에 중괄호 없음)만 훑는다 — @media 안의 규칙도 셀렉터로 찾을 수 있다. */
function rules(): { selectors: string[]; body: string; media: string | null }[] {
  const out: { selectors: string[]; body: string; media: string | null }[] = [];
  for (const match of source.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const before = source.slice(0, match.index);
    const open = before.lastIndexOf("@media");
    // 이 규칙 앞의 가장 가까운 @media 블록이 아직 닫히지 않았으면 그 안에 있다
    let media: string | null = null;
    if (open !== -1) {
      const segment = before.slice(open);
      const depth = (segment.match(/\{/g)?.length ?? 0) - (segment.match(/\}/g)?.length ?? 0);
      if (depth > 0) media = segment.slice(0, segment.indexOf("{")).trim();
    }
    out.push({ selectors: match[1].split(",").map((s) => s.trim()), body: match[2], media });
  }
  return out;
}

function ruleBody(selector: string, media: string | null = null): string {
  const found = rules().filter((r) => r.selectors.includes(selector) && r.media === media);
  if (found.length === 0) throw new Error(`규칙 없음: ${selector} (${media ?? "media 없음"})`);
  return found.map((r) => r.body).join("\n");
}

describe("편집 크롬 — sticky 오프셋과 본문 여백 (CSS 소스 검사)", () => {
  it("크롬은 스크롤 컨테이너 윗 여백만큼 끌어올려 고정한다(top: 0이면 24px 틈으로 본문이 비치고 툴바를 덮었다)", () => {
    expect(ruleBody(".wiki-content")).toContain("--wiki-content-pad-y:");
    expect(ruleBody(".edit-chrome")).toMatch(/top:\s*calc\(-1 \* var\(--wiki-content-pad-y\)\)/);
    expect(ruleBody(".top-toolbar")).toMatch(/top:\s*calc\(var\(--edit-chrome-height\) - var\(--wiki-content-pad-y/);
  });

  it("편집 화면의 음수 마진은 본문 여백 변수를 따른다(좁은 화면에서 32px로 고정돼 가로로 넘쳤다)", () => {
    expect(ruleBody(".page-edit")).toMatch(/margin:\s*calc\(-1 \* var\(--wiki-content-pad-y\)\) calc\(-1 \* var\(--wiki-content-pad-x\)\)/);
    expect(ruleBody(".wiki-content", "@media (max-width: 700px)")).toContain("--wiki-content-pad-x: var(--chanho-space-200)");
  });
});

describe("넘침·잘림", () => {
  it("본문 표는 스크롤 래퍼로 감싸 본문 칼럼을 밀지 않는다", () => {
    const md = ["| 가 | 나 |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    render(<MarkdownView markdown={md} />);
    expect(screen.getByRole("table").parentElement).toHaveClass("md-table-scroll");
    expect(ruleBody(".markdown-body .md-table-scroll")).toContain("overflow-x: auto");
  });

  it("휴지통·보관함 작업 칸은 표 칸으로 남는다(td를 flex로 바꾸면 행 구분선이 끊겼다)", () => {
    expect(ruleBody(".trash-item-actions")).not.toMatch(/display:\s*flex/);
    expect(ruleBody(".trash-table-scroll")).toContain("overflow-x: auto");
  });

  it("좁은 화면 알림함은 헤더 기준으로 화면 폭 안에 펼친다(벨 기준 320px이 왼쪽으로 넘쳤다)", () => {
    expect(ruleBody(".notification-bell", "@media (max-width: 700px)")).toContain("position: static");
    const popover = ruleBody(".notification-popover", "@media (max-width: 700px)");
    expect(popover).toContain("left: var(--chanho-space-200)");
    expect(popover).toContain("right: var(--chanho-space-200)");
  });

  it("페이지 트리의 숨은 행 버튼은 자리를 비운다(투명한 버튼 48px이 제목을 일찍 잘랐다)", () => {
    expect(ruleBody('.page-tree-row:not(:hover):not(:focus-within) .page-tree-add:not([data-state="open"])')).toContain("width: 0");
  });
});

describe("일관성", () => {
  it("링크 기본값이 토큰 링크색이다(브라우저 기본 #0000EE가 표·팝오버에 남았다) — 명시도 0", () => {
    expect(ruleBody(":where(a)")).toContain("color: var(--chanho-color-text-link)");
    expect(ruleBody(":where(a:hover)")).toContain("color: var(--chanho-color-text-link-hovered)");
    // 본문 문장 속 링크는 색만으로 구분하지 않는다(WCAG 1.4.1)
    // :where() 안의 쉼표 때문에 셀렉터 목록 분리 대신 규칙을 통째로 대조한다
    expect(source).toMatch(/:where\(\.markdown-body, \.wiki-editor \.ProseMirror\) a \{\s*text-decoration: underline;/);
  });

  it("화면 제목 h1은 브라우저 기본 여백을 쓰지 않는다(이 화면들만 제목이 16px 아래에 앉았다)", () => {
    for (const selector of [".space-settings-title", ".trash-page-title", ".labels-page-title"]) {
      expect(ruleBody(selector)).toMatch(/margin:\s*0/);
    }
  });

  it("좁은 화면에서 화면 래퍼의 좌우 여백을 없애 본문과 같은 16px 선에서 시작한다", () => {
    const narrow = rules().filter((r) => r.media === "@media (max-width: 700px)" && r.body.includes("padding-inline: 0"));
    const selectors = narrow.flatMap((r) => r.selectors);
    for (const wrapper of [".search-page", ".trash-page", ".space-settings", ".history-page", ".watches-page", ".my-items-page"]) {
      expect(selectors).toContain(wrapper);
    }
    // 래퍼 정의(padding 단축 속성)보다 뒤에 있어야 이긴다
    expect(source.lastIndexOf("padding-inline: 0;")).toBeGreaterThan(source.indexOf(".people-page {"));
  });

  it("편집기 목록 항목 안 문단은 여백이 없다(보기보다 항목 간격이 12px씩 벌어졌다)", () => {
    expect(ruleBody(".wiki-editor .ProseMirror li > p")).toContain("margin: 0");
  });

  it("검색 필터는 같은 폭 격자다", () => {
    expect(ruleBody(".search-filters")).toContain("display: grid");
  });
});
