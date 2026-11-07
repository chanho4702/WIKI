import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MarkdownView } from "./MarkdownView";
import * as store from "../store/wikiStore";
import { MOCK_FEATURES_KEY, __resetPlatformFeaturesForTest, getPlatformFeatures } from "../store/platformApi";
import { __resetAlmIssueCardsForTest } from "../lib/useAlmIssueCards";

/**
 * 위키↔ALM 스마트 링크(W3, 설계 2026-11-08 §4.4·§5). 목업 모드의 고정 카드(ALM-1·ALM-2·WIKI-7)를 쓴다.
 * 카드가 있으면 `KEY 제목 [상태]`, 없거나·실패하거나·ALM이 꺼져 있으면 원래 링크 그대로다.
 */

const ALM_1_NAME = "ALM-1 스마트 링크 카드 조회 API, 진행 중";

beforeEach(() => {
  localStorage.clear();
  __resetPlatformFeaturesForTest();
  __resetAlmIssueCardsForTest();
});

afterEach(() => vi.restoreAllMocks());

function setProducts(products: Record<string, boolean>) {
  localStorage.setItem(MOCK_FEATURES_KEY, JSON.stringify({ search: { mode: "opensearch" }, products }));
}

describe("MarkdownView ALM 스마트 링크", () => {
  it("카드가 있으면 타입 아이콘·키·제목·상태 배지로 그린다", async () => {
    const { container } = render(<MarkdownView markdown={"관련 이슈: [ALM-1](/alm/browse/ALM-1)"} />);

    const link = await screen.findByRole("link", { name: ALM_1_NAME });
    expect(link).toHaveClass("alm-smart-link");
    expect(link).toHaveAttribute("href", "/alm/browse/ALM-1");
    expect(link).toHaveAttribute("data-kind", "active");
    expect(link).toHaveAttribute("title", "담당자: 김철수 · 기한: 2026-11-30");
    expect(link.querySelector(".alm-smart-link__icon svg")).not.toBeNull();
    expect(link.querySelector(".alm-smart-link__key")).toHaveTextContent("ALM-1");
    expect(link.querySelector(".alm-smart-link__title")).toHaveTextContent("스마트 링크 카드 조회 API");
    expect(link).toHaveTextContent("진행 중");
    // 주변 문장은 그대로
    expect(container.textContent).toContain("관련 이슈:");
  });

  it("모달 주소(절대·소문자 키)도 승격하고, 완료 이슈는 키에 취소선 표시를 단다", async () => {
    render(<MarkdownView markdown={"[보기](http://wiki.example/alm/projects/2/issues?issue=wiki-7)"} />);

    const link = await screen.findByRole("link", { name: "WIKI-7 보기 화면에서 이슈 상태 보이기, 완료" });
    expect(link.querySelector(".alm-smart-link__key")).toHaveClass("is-resolved");
  });

  it("담당자·기한이 없으면 title을 달지 않는다", async () => {
    render(<MarkdownView markdown={"[ALM-2](/alm/browse/ALM-2)"} />);

    const link = await screen.findByRole("link", { name: "ALM-2 링크 복사 주소를 정규 주소로, 할 일" });
    expect(link).not.toHaveAttribute("title");
  });

  it("카드가 없는 키(없는 이슈·볼 수 없는 이슈)는 원래 링크 — 위키 라우터가 아니라 ALM 주소로 간다", async () => {
    const spy = vi.spyOn(store, "fetchAlmIssueCards");
    render(
      <MemoryRouter>
        <MarkdownView markdown={"[ALM-999](/alm/browse/ALM-999)"} spaceId="1" />
      </MemoryRouter>,
    );

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const link = await screen.findByRole("link", { name: "ALM-999" });
    expect(link).not.toHaveClass("alm-smart-link");
    // 라우터 Link였다면 basename/상대 해석을 거친다 — ALM은 다른 앱이라 그대로의 주소여야 한다
    expect(link).toHaveAttribute("href", "/alm/browse/ALM-999");
    expect(link).not.toHaveClass("wiki-link");
  });

  it("위키 링크 모드에서도 카드가 있으면 승격한다", async () => {
    render(
      <MemoryRouter>
        <MarkdownView markdown={"[ALM-1](/alm/browse/ALM-1)"} spaceId="1" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: ALM_1_NAME })).toHaveClass("alm-smart-link");
  });

  it("ALM이 설치돼 있지 않으면(products.alm=false) 묻지도 않고 일반 링크다", async () => {
    setProducts({ wiki: true, alm: false, board: true, agent: false });
    const spy = vi.spyOn(store, "fetchAlmIssueCards");
    render(<MarkdownView markdown={"[ALM-1](/alm/browse/ALM-1)"} />);

    await getPlatformFeatures();
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "ALM-1" })).not.toHaveClass("alm-smart-link");
  });

  it("products를 모르는 설치(구버전 게이트웨이)도 일반 링크다", async () => {
    localStorage.setItem(MOCK_FEATURES_KEY, JSON.stringify({ search: { mode: "lite" } }));
    const spy = vi.spyOn(store, "fetchAlmIssueCards");
    render(<MarkdownView markdown={"[ALM-1](/alm/browse/ALM-1)"} />);

    await getPlatformFeatures();
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  it("조회 실패는 조용히 원래 링크 — 콘솔 오류도 없다", async () => {
    const error = vi.spyOn(console, "error");
    const spy = vi.spyOn(store, "fetchAlmIssueCards").mockRejectedValue(new Error("서비스를 사용할 수 없습니다"));
    render(<MarkdownView markdown={"[ALM-1](/alm/browse/ALM-1)"} />);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("link", { name: "ALM-1" })).not.toHaveClass("alm-smart-link");
    expect(error).not.toHaveBeenCalled();
  });

  it("본문의 링크가 여럿이어도 한 번에 묻는다(링크마다 묻지 않는다)", async () => {
    const spy = vi.spyOn(store, "fetchAlmIssueCards");
    render(
      <MarkdownView
        markdown={[
          "- [ALM-1](/alm/browse/ALM-1)",
          "- [다시](/alm/browse/alm-1)",
          "- [WIKI-7](/alm/projects/2/issues?issue=WIKI-7)",
          "- [ALM-2](/alm/browse/ALM-2)",
        ].join("\n")}
      />,
    );

    expect(await screen.findAllByRole("link", { name: ALM_1_NAME })).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1);
    expect([...spy.mock.calls[0][0]].sort()).toEqual(["ALM-1", "ALM-2", "WIKI-7"]);
  });

  it("60초 안에 같은 본문을 다시 열면 다시 묻지 않고 바로 그린다", async () => {
    const spy = vi.spyOn(store, "fetchAlmIssueCards");
    const first = render(<MarkdownView markdown={"[ALM-1](/alm/browse/ALM-1)"} />);
    await screen.findByRole("link", { name: ALM_1_NAME });
    first.unmount();

    render(<MarkdownView markdown={"[ALM-1](/alm/browse/ALM-1)"} />);

    // 캐시에서 첫 렌더부터 스마트 링크다(로딩 동안 원래 링크로 깜빡이지 않는다)
    expect(screen.getByRole("link", { name: ALM_1_NAME })).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ALM 링크가 없는 본문은 아무것도 묻지 않는다", async () => {
    const spy = vi.spyOn(store, "fetchAlmIssueCards");
    render(<MarkdownView markdown={"그냥 [링크](https://example.com) 와 PLAT-12 글자"} />);

    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  it("링크 미리보기 카드(::bookmark)는 인라인 스마트 링크로 바꾸지 않는다", async () => {
    const spy = vi.spyOn(store, "fetchAlmIssueCards");
    const { container } = render(
      <MarkdownView markdown={'::bookmark{url="/alm/browse/ALM-1" title="카드 제목"}'} />,
    );

    await waitFor(() => expect(spy).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector(".bookmark-card")).not.toBeNull();
    expect(container.querySelector(".alm-smart-link")).toBeNull();
  });
});
