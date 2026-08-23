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
    expect(panel).toHaveTextContent("정보");
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
    expect(panel).toHaveTextContent("정보");
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
    expect(panel).toHaveTextContent("정보");
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

describe("MarkdownView — 이미지 폭·캡션", () => {
  it("`#w=` 프래그먼트를 표시 폭으로, title을 캡션으로 렌더한다", () => {
    const md = '![구조도](https://example.com/a.png#w=320 "배포 구조도")';
    const { container } = render(<MarkdownView markdown={md} />);
    const img = container.querySelector("img");
    expect(img).toHaveStyle({ width: "320px" });
    // 실제 로드 URL에는 폭 프래그먼트가 없다
    expect(img?.getAttribute("src")).toBe("https://example.com/a.png");
    expect(container.querySelector(".md-figcaption")).toHaveTextContent("배포 구조도");
  });

  it("폭·캡션이 없으면 기존 렌더 그대로다", () => {
    const { container } = render(<MarkdownView markdown={"![기존](https://example.com/a.png)"} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("style")).toBeNull();
    expect(container.querySelector(".md-figcaption")).toBeNull();
  });
});

describe("MarkdownView — 글자색·배경색", () => {
  it("`:c[..]{.red}`와 `:bg[..]{.yellow}`를 팔레트 클래스 span으로 렌더한다", () => {
    const { container } = render(
      <MarkdownView markdown={"이건 :c[중요]{.red} 그리고 :bg[강조]{.yellow} 입니다"} />,
    );
    expect(container.querySelector("span.txt-red")).toHaveTextContent("중요");
    expect(container.querySelector("span.bg-yellow")).toHaveTextContent("강조");
  });

  it("팔레트 밖 색은 스타일 없이 내용만 통과한다", () => {
    const { container } = render(<MarkdownView markdown={":c[내용]{.hotpink}"} />);
    expect(container.querySelector("[class*='txt-']")).toBeNull();
    expect(container).toHaveTextContent("내용");
  });
});

describe("MarkdownView — 날짜 요소", () => {
  it("`[ISO](date:ISO)`를 한국어 날짜 칩으로 렌더한다", () => {
    const { container } = render(<MarkdownView markdown={"마감: [2026-08-23](date:2026-08-23)"} />);
    const chip = container.querySelector(".date-mention");
    expect(chip).toHaveTextContent("2026년 8월 23일");
    expect(chip?.getAttribute("data-date")).toBe("2026-08-23");
    expect(container.querySelector("a[href^='date:']")).toBeNull();
  });
});

describe("MarkdownView — 사용자 멘션", () => {
  it("`[@이름](user:id)`를 링크가 아니라 칩으로 렌더한다", () => {
    const { container } = render(<MarkdownView markdown={"담당: [@김찬호](user:1)"} />);
    const chip = container.querySelector(".user-mention");
    expect(chip).toHaveTextContent("@김찬호");
    expect(chip?.getAttribute("data-user-id")).toBe("1");
    // 클릭 가능한 앵커로 렌더되지 않는다 — 프로필 화면이 생기기 전까지의 계약
    expect(container.querySelector("a[href^='user:']")).toBeNull();
  });

  it("user: 스킴이 아닌 @링크는 일반 링크 그대로다", () => {
    const { container } = render(
      <MarkdownView markdown={"[@핸들](https://example.com/p)"} />,
    );
    expect(container.querySelector(".user-mention")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com/p");
  });
});

describe("MarkdownView — 토글(details)", () => {
  it("`:::details[제목]`을 네이티브 details/summary로 렌더한다(기본 접힘)", () => {
    const md = [":::details[릴리스 노트]", "숨긴 내용", ":::"].join("\n");
    const { container } = render(<MarkdownView markdown={md} />);
    const details = container.querySelector("details.md-details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(container.querySelector("summary.md-details-summary")).toHaveTextContent("릴리스 노트");
    expect(details).toHaveTextContent("숨긴 내용");
  });

  it("제목 없는 토글은 기본 제목으로 렌더한다 — 화살표만 남지 않게", () => {
    const md = [":::details", "내용", ":::"].join("\n");
    const { container } = render(<MarkdownView markdown={md} />);
    expect(container.querySelector("summary")).toHaveTextContent("펼쳐서 보기");
  });

  it("편집 왕복을 거친 문자열도 같은 구조로 렌더된다 — 편집↔보기 대칭", () => {
    const md = [":::details[제목]", "내용", ":::"].join("\n");
    const roundtripped = serializeMarkdown(parseMarkdown(md));
    const { container } = render(<MarkdownView markdown={roundtripped} />);
    expect(container.querySelector("details.md-details summary")).toHaveTextContent("제목");
  });
});

describe("MarkdownView — 레이어 분할(컬럼)", () => {
  const TWO_COLUMNS = [
    "::::columns",
    ":::column",
    "왼쪽 내용",
    ":::",
    ":::column",
    "오른쪽 내용",
    ":::",
    "::::",
  ].join("\n");

  it("`:::` 확장 문법을 열 구조로 렌더한다", () => {
    const { container } = render(<MarkdownView markdown={TWO_COLUMNS} />);
    const block = container.querySelector(".md-columns");
    expect(block).not.toBeNull();
    const columns = block!.querySelectorAll(".md-column");
    expect(columns).toHaveLength(2);
    expect(columns[0]).toHaveTextContent("왼쪽 내용");
    expect(columns[1]).toHaveTextContent("오른쪽 내용");
  });

  it("마커 문자(:::)가 본문 텍스트로 새어나오지 않는다", () => {
    const { container } = render(<MarkdownView markdown={TWO_COLUMNS} />);
    expect(container.textContent).not.toContain(":::");
  });

  it("편집 왕복을 거친 문자열도 같은 구조로 렌더된다 — 편집↔보기 대칭", () => {
    // 저장 경로(에디터 직렬화)와 렌더 경로(remark)가 같은 문자열을 같게 읽어야 한다
    const saved = serializeMarkdown(parseMarkdown(TWO_COLUMNS));
    const { container } = render(<MarkdownView markdown={saved} />);
    expect(container.querySelectorAll(".md-column")).toHaveLength(2);
  });

  it("열 안의 블록 요소(제목·목록)도 그 열 안에서 렌더된다", () => {
    const md = [
      "::::columns",
      ":::column",
      "## 왼쪽 제목",
      ":::",
      ":::column",
      "- 오른쪽 항목",
      ":::",
      "::::",
    ].join("\n");
    const { container } = render(<MarkdownView markdown={md} />);
    const columns = container.querySelectorAll(".md-column");
    expect(columns[0].querySelector("h2")).toHaveTextContent("왼쪽 제목");
    expect(columns[1].querySelector("li")).toHaveTextContent("오른쪽 항목");
  });

  it("모르는 지시자는 내용을 잃지 않고 통과시킨다", () => {
    // `:::` 문법을 쓰는 다른 블록이 나중에 추가돼도 본문이 조용히 증발하면 안 된다
    const { container } = render(<MarkdownView markdown={":::unknown\n남아야 할 내용\n:::"} />);
    expect(container.textContent).toContain("남아야 할 내용");
  });
});
