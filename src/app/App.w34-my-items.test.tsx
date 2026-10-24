import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import * as store from "../features/wiki/store/wikiStore";
import { __resetForTest, createPage } from "../features/wiki/store/wikiStore";
import { getStarredPageEntries, setStarredPageEntries } from "../features/wiki/lib/starredPages";

/*
 * F-04 — 별표·최근·내 초안 전체 목록(`/my/:tab`). 사이드바 플라이아웃은 몇 개만 보여 주고
 * "전체 보기"가 이 화면으로 온다(최근의 "전체 보기"는 예전엔 홈으로 갔다).
 */

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});
afterEach(() => vi.restoreAllMocks());

describe("F-04 내 항목 — 별표", () => {
  it("별표가 40개여도 사이드바 '전체 보기'에서 전부 보이고, 그 자리에서 별표를 해제한다", async () => {
    const user = userEvent.setup();
    const pages = [];
    for (let i = 0; i < 40; i++) pages.push(await createPage({ spaceId: "sp1", title: `별표 문서 ${i}` }));
    setStarredPageEntries(pages.map((p) => ({ id: p.id, spaceId: "sp1", title: p.title, type: "page" as const })));

    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(screen.getByRole("button", { name: "별표 표시" }));
    const panel = await screen.findByRole("dialog", { name: "별표 표시" });
    await user.click(within(panel).getByRole("button", { name: "전체 보기" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/my/starred"));
    const table = await screen.findByRole("table", { name: "별표한 문서" });
    expect(within(table).getAllByRole("link")).toHaveLength(40);

    await user.click(within(table).getByRole("button", { name: "별표 문서 7 별표 해제" }));
    await waitFor(() => expect(within(table).getAllByRole("link")).toHaveLength(39));
    expect(getStarredPageEntries().some((e) => e.title === "별표 문서 7")).toBe(false);
  });
});

describe("F-04 내 항목 — 최근", () => {
  it("최근의 '전체 보기'는 홈이 아니라 최근 방문 전체 목록으로 간다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    await user.click(screen.getByRole("button", { name: /최근/ }));
    const panel = await screen.findByRole("dialog", { name: "최근" });
    await within(panel).findByRole("button", { name: /시작하기/ });
    await user.click(within(panel).getByRole("link", { name: "전체 보기" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/my/recent"));
    // 표는 로딩 중에도 같은 자리에 먼저 그려진다(행만 스켈레톤) — 행은 기다려서 찾는다
    const table = await screen.findByRole("table", { name: "최근 방문 문서" });
    expect(await within(table).findByRole("link", { name: "시작하기" })).toBeInTheDocument();
  });
});

describe("F-04 내 항목 — 내 초안", () => {
  it("내 초안 탭에 내가 만든 초안이 있고 '이어서 편집'으로 편집 화면을 연다", async () => {
    const user = userEvent.setup();
    const draft = await createPage({ spaceId: "sp1", title: "쓰다 만 문서", status: "draft" });
    renderApp("/my/drafts");

    const table = await screen.findByRole("table", { name: "내 초안" });
    expect(await within(table).findByRole("link", { name: "쓰다 만 문서" })).toBeInTheDocument();
    expect(within(table).queryByRole("link", { name: "시작하기" })).not.toBeInTheDocument();

    await user.click(within(table).getByRole("button", { name: "쓰다 만 문서 이어서 편집" }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(`/spaces/sp1/pages/${draft.id}/edit`));
  });

  it("서버에 초안 목록 API가 없으면(null) 탭을 숨기고 초안 주소는 최근으로 돌린다", async () => {
    vi.spyOn(store, "listMyDrafts").mockResolvedValue(null);
    renderApp("/my/drafts");

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/my/recent"));
    expect(await screen.findByRole("tab", { name: "최근 방문" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "내 초안" })).not.toBeInTheDocument();
  });

  it("모르는 탭 주소는 최근으로 돌린다", async () => {
    renderApp("/my/unknown");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/my/recent"));
  });
});
