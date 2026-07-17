import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W5 목차(TOC)", () => {
  it("heading 4개(pg1)인 페이지는 목차를 렌더하고 각 링크가 실제 heading id를 가리킨다", async () => {
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "개발 위키에 오신 것을 환영합니다" });

    const toc = screen.getByRole("navigation", { name: "목차" });
    expect(within(toc).getByRole("link", { name: "개발 위키에 오신 것을 환영합니다" })).toHaveAttribute(
      "href",
      "#개발-위키에-오신-것을-환영합니다",
    );
    expect(within(toc).getByRole("link", { name: "시작 순서" })).toHaveAttribute(
      "href",
      "#시작-순서",
    );
    expect(within(toc).getByRole("link", { name: "주요 명령어" })).toHaveAttribute(
      "href",
      "#주요-명령어",
    );
    expect(within(toc).getByRole("link", { name: "예시 코드" })).toHaveAttribute(
      "href",
      "#예시-코드",
    );

    // 목차 링크의 href가 가리키는 slug가 실제 렌더된 heading id와 일치한다 (rehype-slug ↔ TableOfContents 정합)
    expect(document.getElementById("시작-순서")).toHaveTextContent("시작 순서");
    expect(document.getElementById("주요-명령어")).toHaveTextContent("주요 명령어");
  });

  it("heading이 2개뿐인 페이지(pg2)는 목차를 렌더하지 않는다", async () => {
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    expect(screen.queryByRole("navigation", { name: "목차" })).not.toBeInTheDocument();
  });
});
