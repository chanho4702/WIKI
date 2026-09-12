import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, seedPlatformFeatures } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import * as platformApi from "../features/wiki/store/platformApi";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  platformApi.__resetPlatformFeaturesForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
  vi.restoreAllMocks();
});

/**
 * 통합 검색 설치 옵션(`SEARCH_MODE`, 2026-09-12) — 프론트 몫(F1·F2).
 *
 * 옵션을 끈 설치(`lite`)에서도 검색 자체는 같은 계약으로 동작한다. 화면에서 달라지는 것은
 * 둘뿐이다: **색인 관리로 가는 길이 없어야 하고**, 결과의 성격이 다르다는 것을 말해야 한다.
 */
describe("W31 통합 검색 설치 옵션 — 관리 메뉴", () => {
  async function openSettingsMenu() {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(screen.getByRole("button", { name: "설정" }));
    // 항목이 하나라도 뜬 뒤에 없음을 단언해야 "아직 안 열린 것"과 구분된다
    await screen.findByRole("menuitem", { name: /단축키 도움말/ });
  }

  it("통합 검색이 켜진 설치에는 색인 관리 항목이 있다", async () => {
    await openSettingsMenu();

    expect(await screen.findByRole("menuitem", { name: /검색 색인 관리/ })).toBeInTheDocument();
  });

  it("라이트 설치에서는 색인 관리 항목이 사라진다", async () => {
    seedPlatformFeatures("lite");

    await openSettingsMenu();

    expect(screen.queryByRole("menuitem", { name: /검색 색인 관리/ })).not.toBeInTheDocument();
    // 다른 관리 항목은 그대로다 — 검색 옵션이 관리 메뉴 전체를 지우면 안 된다
    expect(screen.getByRole("menuitem", { name: /사용자·팀/ })).toBeInTheDocument();
  });

  /**
   * 기능 플래그를 못 읽는 것은 "켜졌다"가 아니다(설계 §6.2). 조회가 통째로 깨져도 라이트로
   * 접혀야 죽은 화면으로 안내하지 않는다.
   */
  it("설치 옵션 조회가 실패하면 라이트로 접힌다", async () => {
    vi.spyOn(platformApi, "getPlatformFeatures").mockRejectedValue(new Error("gateway down"));

    await openSettingsMenu();

    expect(screen.queryByRole("menuitem", { name: /검색 색인 관리/ })).not.toBeInTheDocument();
  });
});

describe("W31 통합 검색 설치 옵션 — 색인 관리 화면 직접 진입", () => {
  it("라이트 설치에서는 권한이 아니라 설치 옵션 문제임을 알린다", async () => {
    seedPlatformFeatures("lite");

    renderApp("/admin/search");

    expect(
      await screen.findByRole("heading", { name: "통합 검색 옵션이 꺼져 있습니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/SEARCH_MODE/)).toBeInTheDocument();
    // 권한 안내로 뭉뚱그리면 관리자가 없는 권한을 찾아 헤맨다
    expect(
      screen.queryByRole("heading", { name: "검색 색인을 관리할 수 없습니다" }),
    ).not.toBeInTheDocument();
  });

  /** 켜진 설치의 기존 동작은 그대로다 — 목업에는 색인이 없어 "관리할 수 없음"으로 간다. */
  it("켜진 설치에서는 색인 현황을 조회한다", async () => {
    renderApp("/admin/search");

    expect(
      await screen.findByRole("heading", { name: "검색 색인을 관리할 수 없습니다" }),
    ).toBeInTheDocument();
  });
});

describe("W31 통합 검색 설치 옵션 — 검색 화면 안내", () => {
  const NOTICE = "이 설치는 위키 자체 검색입니다. 통합 검색(OpenSearch) 옵션은 꺼져 있습니다.";

  it("라이트 설치는 결과의 성격이 다르다는 것을 한 줄로 알린다", async () => {
    seedPlatformFeatures("lite");

    renderApp("/search?q=설정");

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
  });

  it("켜진 설치에는 안내가 없다", async () => {
    renderApp("/search?q=설정");
    await screen.findByRole("heading", { level: 1, name: "검색" });

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  /**
   * 공개 문서 인스턴스에는 적지 않는다 — 읽는 사람이 설치 옵션을 어쩔 수 없고, 게이트웨이를
   * 거치지 않아 조회 자체가 라이트로 접히는 곳이다.
   */
  it("공개 문서 인스턴스에는 안내를 띄우지 않는다", async () => {
    seedPlatformFeatures("lite");

    renderApp("/search?q=설정", { readOnly: true });
    await screen.findByRole("heading", { level: 1, name: "검색" });

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
