import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { extractHeadings, TableOfContents } from "./TableOfContents";

describe("extractHeadings", () => {
  it("heading 1~3을 문서 순서대로 추출한다", () => {
    const md = ["# 제목", "본문", "## 소제목 A", "내용", "### 소소제목"].join("\n");
    expect(extractHeadings(md)).toEqual([
      { level: 1, slug: "제목", text: "제목" },
      { level: 2, slug: "소제목-a", text: "소제목 A" },
      { level: 3, slug: "소소제목", text: "소소제목" },
    ]);
  });

  it("heading 4 이상은 목차에 포함하지 않는다", () => {
    const md = ["# A", "## B", "### C", "#### D(4레벨)"].join("\n");
    const headings = extractHeadings(md);
    expect(headings.map((h) => h.text)).toEqual(["A", "B", "C"]);
  });

  it("코드 펜스(```) 내부의 # 줄은 heading으로 취급하지 않는다", () => {
    const md = ["# 진짜 제목", "```", "# 코드 안의 주석", "## 이것도 아님", "```", "## 진짜 소제목", "### 진짜 소소제목"].join(
      "\n",
    );
    const headings = extractHeadings(md);
    expect(headings.map((h) => h.text)).toEqual(["진짜 제목", "진짜 소제목", "진짜 소소제목"]);
  });

  it("~~~ 펜스도 동일하게 제외한다", () => {
    const md = ["# 하나", "~~~", "# 안 셈", "~~~", "## 둘", "### 셋"].join("\n");
    expect(extractHeadings(md).map((h) => h.text)).toEqual(["하나", "둘", "셋"]);
  });

  it("중복 heading 텍스트는 slugger 규칙대로 -1, -2가 붙는다", () => {
    const md = ["# 제목", "## 제목", "### 제목"].join("\n");
    expect(extractHeadings(md).map((h) => h.slug)).toEqual(["제목", "제목-1", "제목-2"]);
  });

  it("h4~h6도 slug 계산에는 참여해 occurrence 번호가 실제 렌더 결과와 어긋나지 않는다", () => {
    // h1 "소개" → 소개, h4 "소개"(목차엔 안 나오지만 slugger는 소비) → 소개-1, h1 "소개" → 소개-2
    const md = ["# 소개", "#### 소개", "# 소개", "## 더미1", "### 더미2"].join("\n");
    const headings = extractHeadings(md);
    expect(headings.map((h) => ({ text: h.text, slug: h.slug }))).toEqual([
      { text: "소개", slug: "소개" },
      { text: "소개", slug: "소개-2" },
      { text: "더미1", slug: "더미1" },
      { text: "더미2", slug: "더미2" },
    ]);
  });

  it("굵게/기울임/인라인 코드 서식을 제거하고 slug를 계산한다", () => {
    const md = ["# **굵은** 제목", "## *기울인* 소제목", "### `코드` 소소제목"].join("\n");
    const headings = extractHeadings(md);
    expect(headings.map((h) => h.text)).toEqual(["굵은 제목", "기울인 소제목", "코드 소소제목"]);
    expect(headings.map((h) => h.slug)).toEqual(["굵은-제목", "기울인-소제목", "코드-소소제목"]);
  });

  it("[[위키링크]]는 제목만 남기고, [라벨](url)은 라벨만 남긴다", () => {
    const md = ["# [[시작하기]] 안내", "## [문서](https://example.com) 참고", "### 세 번째"].join("\n");
    const headings = extractHeadings(md);
    expect(headings.map((h) => h.text)).toEqual(["시작하기 안내", "문서 참고", "세 번째"]);
  });

  it("빈 heading이나 heading이 하나도 없으면 빈 배열을 반환한다", () => {
    expect(extractHeadings("본문만 있는 문서입니다.")).toEqual([]);
  });
});

describe("TableOfContents", () => {
  it("heading이 3개 미만이면 아무것도 렌더하지 않는다", () => {
    const md = ["# 제목", "## 소제목"].join("\n");
    const { container } = render(<TableOfContents markdown={md} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("heading이 3개 이상이면 nav.page-toc로 링크 목록을 렌더한다", () => {
    const md = ["# 제목", "본문", "## 소제목 A", "내용", "### 소소제목"].join("\n");
    render(<TableOfContents markdown={md} />);
    const nav = screen.getByRole("navigation", { name: "목차" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "제목" })).toHaveAttribute("href", "#제목");
    expect(screen.getByRole("link", { name: "소제목 A" })).toHaveAttribute("href", "#소제목-a");
    expect(screen.getByRole("link", { name: "소소제목" })).toHaveAttribute("href", "#소소제목");
  });

  it("레벨별로 다른 클래스를 부여해 들여쓰기를 구분한다", () => {
    const md = ["# 제목", "## 소제목", "### 소소제목"].join("\n");
    const { container } = render(<TableOfContents markdown={md} />);
    expect(container.querySelector("li.page-toc-level-1")).not.toBeNull();
    expect(container.querySelector("li.page-toc-level-2")).not.toBeNull();
    expect(container.querySelector("li.page-toc-level-3")).not.toBeNull();
  });
});
