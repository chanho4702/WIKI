import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "./testUtils";
import * as store from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

/**
 * 로딩 스피너 → 스켈레톤(2026-10-24, 사용자 지시 "로딩 스피너 다 걷어내고 스켈레톤 UI 적용").
 *
 * 계약 세 가지를 고정한다.
 * 1) 페이지·목록·트리·카드·패널 로딩은 DS 스켈레톤으로 그린다 — 화면에 스피너가 없다.
 * 2) 진행 상태는 role=status 문구(기존 라벨 그대로)가 알리고, 회색 블록 영역은 aria-hidden이다.
 * 3) 자리는 실제 콘텐츠와 같은 컨테이너(클래스)로 잡는다 — 로드 순간 레이아웃이 밀리지 않게.
 *    (jsdom은 레이아웃을 계산하지 않아 치수는 헤드리스 캡처로 확인했고, 여기서는 같은 틀을 쓰는지를 본다.)
 */

// 목업 스토어는 즉시 resolve한다 — 응답을 붙잡아 로딩 프레임을 결정적으로 고정한다.
const pending = <T,>() => new Promise<T>(() => {});

/** 스켈레톤 영역 — 장식이라 aria-hidden이어야 하고, 안의 블록은 DS Skeleton이다. */
function skeletonRegions(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".wiki-skeleton")];
}

/** DS Spinner는 SVG 원을 돌린다 — 로딩 화면에 svg 원형 스피너가 남지 않았는지 본다. */
function spinnerCount(): number {
  return document.querySelectorAll('[class*="spinner"]').length;
}

function expectSkeletonFor(label: string) {
  const status = screen.getByText(label);
  expect(status).toHaveAttribute("role", "status");
  const regions = skeletonRegions();
  expect(regions.length).toBeGreaterThan(0);
  for (const region of regions) expect(region).toHaveAttribute("aria-hidden", "true");
  expect(spinnerCount()).toBe(0);
}

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});
afterEach(() => vi.restoreAllMocks());

describe("스켈레톤 로딩 — 셸·문서", () => {
  it("스페이스 목록을 받기 전에는 셸 자리(상단바·본문 문서 자리)를 그린다", async () => {
    vi.spyOn(store, "listSpaces").mockReturnValue(pending());
    renderApp("/home");

    expect(await screen.findByText("불러오는 중")).toHaveAttribute("role", "status");
    // 상단바는 DS TopBar 그대로(높이·테두리가 셸과 같다), 본문에는 문서 자리
    expect(screen.getByRole("banner")).toHaveTextContent("WIKI");
    expect(document.querySelector(".wiki-content .page-view-skeleton")).not.toBeNull();
    expect(spinnerCount()).toBe(0);
  });

  it("문서 보기는 브레드크럼·제목·메타·본문 문단 자리를 같은 .page-view 안에 그린다", async () => {
    vi.spyOn(store, "getPage").mockReturnValue(pending());
    renderApp("/spaces/sp1/pages/pg1");

    await screen.findByText("페이지 로딩 중");
    expectSkeletonFor("페이지 로딩 중");
    const skeleton = document.querySelector(".page-view > .page-view-skeleton")!;
    expect(skeleton).not.toBeNull();
    expect(skeleton.querySelector(".page-view-skeleton-crumb")).not.toBeNull();
    expect(skeleton.querySelector(".page-view-skeleton-title")).not.toBeNull();
    expect(skeleton.querySelector(".page-view-skeleton-meta")).not.toBeNull();
    expect(skeleton.querySelectorAll(".page-view-skeleton-body > *").length).toBeGreaterThan(1);
  });

  it("사이드바 페이지 트리는 트리 행(.page-tree-row)과 같은 틀로 들여쓴 자리를 그린다", async () => {
    vi.spyOn(store, "listChildren").mockReturnValue(pending());
    renderApp("/spaces/sp1");

    await screen.findByText("페이지 트리 로딩 중");
    const rows = document.querySelectorAll<HTMLElement>(".wiki-skeleton-tree > .page-tree-row");
    expect(rows.length).toBeGreaterThan(3);
    // 단계가 섞여 있어야 트리로 읽힌다(들여쓰기 16px 단위)
    const indents = new Set([...rows].map((row) => row.style.paddingInlineStart));
    expect(indents.size).toBeGreaterThan(1);
    expect(spinnerCount()).toBe(0);
  });
});

describe("스켈레톤 로딩 — 목록·카드", () => {
  it("홈 새 소식 피드는 실제 피드 행(.home-recent-item)과 같은 틀로 자리를 잡는다", async () => {
    vi.spyOn(store, "listRecentlyUpdated").mockReturnValue(pending());
    renderApp("/home");

    const section = await screen.findByRole("region", { name: "새 소식" });
    await within(section).findByText("최근 업데이트 불러오는 중");
    expect(within(section).getByText("최근 업데이트 불러오는 중")).toHaveAttribute("role", "status");
    const list = section.querySelector("ul.home-recent.wiki-skeleton")!;
    expect(list).toHaveAttribute("aria-hidden", "true");
    expect(list.querySelectorAll(":scope > li.home-recent-item").length).toBe(5);
  });

  it("홈 스페이스 카드는 받기 전에도 섹션과 카드 자리를 둔다(아래 피드가 밀리지 않게)", async () => {
    let release: (value: Awaited<ReturnType<typeof store.listSpaces>>) => void = () => {};
    const real = store.listSpaces;
    // 셸은 실제 목록을 받고, 홈이 따로 읽는 호출만 붙잡는다
    vi.spyOn(store, "listSpaces")
      .mockImplementationOnce(() => real())
      .mockImplementation(() => new Promise((resolve) => (release = resolve)));
    renderApp("/home");

    const section = await screen.findByRole("region", { name: "스페이스" });
    expect(within(section).getByText("스페이스 불러오는 중")).toHaveAttribute("role", "status");
    expect(section.querySelectorAll("ul.home-space-grid.wiki-skeleton > li.home-space-card").length).toBe(4);

    release(await real());
    await waitFor(() => expect(section.querySelector(".wiki-skeleton")).toBeNull());
    expect(within(section).getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("검색 결과는 결과 행(.search-result-item)과 같은 틀로 자리를 잡고 스피너를 쓰지 않는다", async () => {
    vi.spyOn(store, "searchContent").mockReturnValue(pending());
    renderApp("/search?q=시작");

    await screen.findByText("‘시작’ 검색 중");
    expectSkeletonFor("‘시작’ 검색 중");
    expect(document.querySelectorAll(".wiki-skeleton .search-result-list > .search-result-item").length).toBe(4);
  });

  it("알림 목록은 알림 행(.notification-item) 자리를 그린다", async () => {
    vi.spyOn(store, "listNotifications").mockReturnValue(pending());
    renderApp("/notifications");

    await screen.findByText("알림 불러오는 중");
    expectSkeletonFor("알림 불러오는 중");
    expect(document.querySelectorAll("ul.notification-list.wiki-skeleton > li.notification-item").length).toBe(5);
  });

  it("DS 표 화면은 머리글을 둔 채 행 자리만 스켈레톤으로 채운다(Table loading)", async () => {
    vi.spyOn(store, "listRecentPages").mockReturnValue(pending<null>());
    renderApp("/my/recent");

    const table = await screen.findByRole("table", { name: "최근 방문 문서" });
    expect(table).toHaveAttribute("aria-busy", "true");
    expect(within(table).getByRole("columnheader", { name: "제목" })).toBeInTheDocument();
    expect(screen.getByText("최근 방문 불러오는 중")).toHaveAttribute("role", "status");
    expect(spinnerCount()).toBe(0);
  });

  it("휴지통 같은 생 표는 실제 머리글을 그대로 두고 몸통 행만 자리표시한다", async () => {
    vi.spyOn(store, "listTrash").mockReturnValue(pending());
    renderApp("/spaces/sp1/trash");

    await screen.findByText("휴지통 로딩 중");
    expectSkeletonFor("휴지통 로딩 중");
    const table = document.querySelector(".wiki-skeleton.trash-table-scroll > table.trash-table")!;
    expect(table).not.toBeNull();
    expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual([
      "이름",
      "삭제한 사람",
      "삭제한 시각",
      "작업",
    ]);
  });

  it("로드가 끝나면 스켈레톤이 하나도 남지 않는다(검색)", async () => {
    renderApp("/search?q=시작");
    await screen.findByRole("list", { name: "검색 결과" });
    expect(skeletonRegions()).toHaveLength(0);
  });
});

describe("스피너 금지 (소스 검사)", () => {
  // 버튼 안 로딩(Button loading)·인라인 이미지 자리처럼 작은 진행 표시는 DS 내부 몫이라 대상이 아니다 —
  // 화면 코드가 Spinner를 직접 그리는 일 자체가 없어야 한다.
  const sources = import.meta.glob<string>(["../**/*.tsx", "!../**/*.test.tsx"], {
    query: "?raw",
    import: "default",
    eager: true,
  });

  it("화면 코드에서 DS Spinner를 직접 쓰지 않는다", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const offenders = Object.entries(sources)
      .filter(([, text]) => /<Spinner\b/.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
