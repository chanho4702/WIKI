import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import {
  MOCK_FEATURES_KEY,
  __resetPlatformFeaturesForTest,
  fetchPlatformFeatures,
  getPlatformFeatures,
  normalizeFeatures,
  peekPlatformFeatures,
} from "./platformApi";

/**
 * 설치 옵션 조회(`/api/platform/features`) — 계약의 핵심은 **모르면 라이트**다.
 * 반대로 접히면 통합 검색이 꺼진 설치에서 죽은 관리 메뉴가 살아난다.
 */

function mockResponse(status: number, body: unknown, json = true) {
  return vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
    new Response(json ? JSON.stringify(body) : (body as string), {
      status,
      headers: { "Content-Type": json ? "application/json" : "text/html" },
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetPlatformFeaturesForTest();
});

afterEach(() => vi.restoreAllMocks());

describe("normalizeFeatures", () => {
  it("모르는 모드는 라이트로 좁힌다", () => {
    expect(normalizeFeatures({ search: { mode: "elasticsearch-9" } }).search).toEqual({
      mode: "lite",
      unified: false,
      reindex: false,
    });
  });

  it("mode만 온 응답에서 능력 플래그를 파생한다", () => {
    expect(normalizeFeatures({ search: { mode: "external" } }).search).toEqual({
      mode: "external",
      unified: true,
      reindex: true,
    });
  });

  it("서버가 준 불리언이 파생값을 이긴다", () => {
    // external은 고객사 클러스터라 통합 색인 범위가 우리 것과 다를 수 있다 — 서버 말을 따른다
    expect(normalizeFeatures({ search: { mode: "external", unified: false } }).search).toMatchObject({
      mode: "external",
      unified: false,
      reindex: true,
    });
  });

  it("모양이 아예 다른 응답도 라이트로 답한다", () => {
    expect(normalizeFeatures(null).search.mode).toBe("lite");
    expect(normalizeFeatures({}).search.mode).toBe("lite");
    expect(normalizeFeatures("nope").search.reindex).toBe(false);
  });
});

/**
 * 설치 제품(W3, 설계 2026-11-08 §4.2) — **모르면 없다.** 반대로 접히면 ALM이 없는 설치에서
 * 위키가 죽은 카드 조회를 쏘고 죽은 슬래시 메뉴("ALM 이슈")를 띄운다.
 */
describe("normalizeFeatures — products", () => {
  const NONE = { wiki: false, alm: false, board: false, agent: false };

  it("products가 없는 응답(구버전 게이트웨이)은 전부 꺼짐이다", () => {
    expect(normalizeFeatures({ search: { mode: "opensearch" } }).products).toEqual(NONE);
  });

  it("모양이 다른 응답·JSON이 아닌 값도 전부 꺼짐이다", () => {
    expect(normalizeFeatures(null).products).toEqual(NONE);
    expect(normalizeFeatures("nope").products).toEqual(NONE);
    expect(normalizeFeatures({ products: "wiki,alm" }).products).toEqual(NONE);
  });

  it("서버가 준 값을 그대로 읽는다 — PLATFORM_PRODUCTS=wiki,board", () => {
    expect(
      normalizeFeatures({ products: { wiki: true, alm: false, board: true, agent: false } }).products,
    ).toEqual({ wiki: true, alm: false, board: true, agent: false });
  });

  it("true만 켜짐이다 — 문자열·숫자·빠진 키는 꺼짐", () => {
    expect(normalizeFeatures({ products: { wiki: "true", alm: 1, board: true } }).products).toEqual({
      wiki: false,
      alm: false,
      board: true,
      agent: false,
    });
  });
});

describe("fetchPlatformFeatures (백엔드 모드)", () => {
  it("정상 응답을 그대로 읽는다", async () => {
    const spy = mockResponse(200, { search: { mode: "opensearch", unified: true, reindex: true } });

    await expect(fetchPlatformFeatures()).resolves.toEqual({
      search: { mode: "opensearch", unified: true, reindex: true },
      products: { wiki: false, alm: false, board: false, agent: false },
    });
    expect(spy).toHaveBeenCalledWith("/api/platform/features");
  });

  it.each([
    ["404 — 구버전 게이트웨이", 404],
    ["401 — 로그인 전", 401],
    ["503 — 게이트웨이 장애", 503],
  ])("%s는 라이트로 접는다", async (_name, status) => {
    mockResponse(status, { error: "no" });

    await expect(fetchPlatformFeatures()).resolves.toMatchObject({
      search: { mode: "lite", reindex: false },
      products: { alm: false },
    });
  });

  it("네트워크 실패도 라이트로 접는다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(fetchPlatformFeatures()).resolves.toMatchObject({ search: { mode: "lite" }, products: { alm: false } });
  });

  it("products 블록을 읽는다", async () => {
    mockResponse(200, { search: { mode: "lite" }, products: { wiki: true, alm: true, board: true, agent: true } });

    await expect(fetchPlatformFeatures()).resolves.toMatchObject({
      products: { wiki: true, alm: true, board: true, agent: true },
    });
  });

  it("JSON이 아닌 200(로그인 HTML 등)도 라이트로 접는다", async () => {
    mockResponse(200, "<!doctype html>", false);

    await expect(fetchPlatformFeatures()).resolves.toMatchObject({ search: { mode: "lite" } });
  });
});

describe("getPlatformFeatures (목업 모드)", () => {
  it("기본값은 opensearch — 목업/dev는 현재 화면 그대로다", async () => {
    await expect(getPlatformFeatures()).resolves.toEqual({
      search: { mode: "opensearch", unified: true, reindex: true },
      products: { wiki: true, alm: true, board: true, agent: true },
    });
  });

  it("주입한 모드를 읽는다", async () => {
    localStorage.setItem(MOCK_FEATURES_KEY, JSON.stringify({ search: { mode: "lite" } }));

    await expect(getPlatformFeatures()).resolves.toEqual({
      search: { mode: "lite", unified: false, reindex: false },
      products: { wiki: false, alm: false, board: false, agent: false },
    });
  });

  it("깨진 주입값은 무시하고 기본값으로 간다", async () => {
    localStorage.setItem(MOCK_FEATURES_KEY, "{{{");

    await expect(getPlatformFeatures()).resolves.toMatchObject({ search: { mode: "opensearch" } });
  });

  it("세션 1회만 읽는다 — 설치 옵션은 배포 중에 바뀌지 않는다", async () => {
    await getPlatformFeatures();
    localStorage.setItem(MOCK_FEATURES_KEY, JSON.stringify({ search: { mode: "lite" } }));

    // 캐시가 살아 있는 동안은 같은 답
    await expect(getPlatformFeatures()).resolves.toMatchObject({ search: { mode: "opensearch" } });

    __resetPlatformFeaturesForTest();
    await expect(getPlatformFeatures()).resolves.toMatchObject({ search: { mode: "lite" } });
  });

  it("peekPlatformFeatures는 받기 전엔 null, 받은 뒤엔 같은 값을 동기로 준다", async () => {
    expect(peekPlatformFeatures()).toBeNull();

    const value = await getPlatformFeatures();

    expect(peekPlatformFeatures()).toEqual(value);
    __resetPlatformFeaturesForTest();
    expect(peekPlatformFeatures()).toBeNull();
  });
});
