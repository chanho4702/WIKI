import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
  vi.restoreAllMocks();
});

/**
 * 검색 색인 관리(W23) — 전역 관리자 전용.
 *
 * 목업 모드에는 색인이 없어 현황 조회가 null을 준다. 화면은 그것을 403(권한 없음)과 같게
 * 다뤄야 한다 — 두 경우 모두 "관리할 수 없는 상태"이고, 구분해 봐야 사용자가 할 일이 없다.
 */
describe("W23 감사 로그", () => {
  /** 목업에는 기록이 없다 — 빈 목록이면 "권한이 없는 건지 기록이 없는 건지"가 문구로 갈려야 한다. */
  it("기록이 없으면 그 사실을 알린다", async () => {
    renderApp("/spaces/sp1/settings/audit");
    await screen.findByRole("heading", { level: 1, name: "감사 로그" });

    expect(await screen.findByRole("heading", { name: "기록이 없습니다" })).toBeInTheDocument();
  });

  it("설정 사이드바에서 감사 로그로 갈 수 있다", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    renderApp("/spaces/sp1/settings");
    await screen.findByRole("heading", { level: 1, name: "일반" });

    await user.click(screen.getByRole("link", { name: "감사 로그" }));

    expect(await screen.findByRole("heading", { level: 1, name: "감사 로그" })).toBeInTheDocument();
  });
});

describe("W23 검색 색인 관리", () => {
  it("관리할 수 없으면 그 사실을 알린다", async () => {
    renderApp("/admin/search");

    expect(
      await screen.findByRole("heading", { name: "검색 색인을 관리할 수 없습니다" }),
    ).toBeInTheDocument();
  });

  /** 아닌 사람에게 띄우면 눌러도 "권한 없음"만 나온다 — 없는 것이 낫다. */
  it("전역 관리자가 아니면 설정 메뉴에 색인 항목이 없다", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "설정" }));

    expect(await screen.findByRole("menuitem", { name: /단축키 도움말/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /검색 색인 관리/ })).not.toBeInTheDocument();
  });
});
