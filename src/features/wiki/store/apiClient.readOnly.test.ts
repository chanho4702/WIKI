import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 인스턴스별 경계 설정(설계 §2.2) — 경로 접두사와 로그인 게이트는 빌드 변수로 갈린다.
 * 모듈 평가 시점에 상수로 굳으므로 stubEnv 후 resetModules로 다시 읽는다.
 */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("apiClient 인스턴스 설정", () => {
  it("기본(팀 위키)은 경로를 그대로 둔다", async () => {
    const { resolveApiPath, WIKI_API_PREFIX, SEARCH_API_PREFIX } = await import("./apiClient");
    expect(WIKI_API_PREFIX).toBe("/api/wiki");
    expect(SEARCH_API_PREFIX).toBe("/api/search");
    expect(resolveApiPath("/api/wiki/spaces")).toBe("/api/wiki/spaces");
    expect(resolveApiPath("/api/search/graphql")).toBe("/api/search/graphql");
  });

  it("접두사를 주면 wiki·search 경로만 바꾸고 플랫폼 공통 경계는 건드리지 않는다", async () => {
    vi.stubEnv("VITE_WIKI_API_PREFIX", "/api/docs");
    vi.stubEnv("VITE_SEARCH_API_PREFIX", "/api/docs/search");
    vi.resetModules();
    const { resolveApiPath } = await import("./apiClient");

    expect(resolveApiPath("/api/wiki/spaces")).toBe("/api/docs/spaces");
    expect(resolveApiPath("/api/wiki/pages/7/attachments")).toBe("/api/docs/pages/7/attachments");
    expect(resolveApiPath("/api/search/graphql")).toBe("/api/docs/search/graphql");
    // /api/me·/api/org·/api/auth는 게이트웨이 공통 경계다 — 인스턴스 접두사를 붙이지 않는다
    expect(resolveApiPath("/api/me")).toBe("/api/me");
    expect(resolveApiPath("/api/org/members")).toBe("/api/org/members");
    expect(resolveApiPath("/api/auth/refresh")).toBe("/api/auth/refresh");
    // 접두사가 다른 경로의 접두어인 경우를 잘라 먹지 않는다
    expect(resolveApiPath("/api/wikipedia")).toBe("/api/wikipedia");
  });

  it("읽기 전용 빌드는 백엔드 모드여도 로그인 게이트를 켜지 않는다", async () => {
    vi.stubEnv("VITE_API_PROXY", "http://localhost:18000");
    vi.resetModules();
    const withLogin = await import("./apiClient");
    expect(withLogin.USE_BACKEND).toBe(true);
    expect(withLogin.AUTH_GATE_ENABLED).toBe(true);

    vi.stubEnv("VITE_WIKI_READONLY", "true");
    vi.resetModules();
    const readOnly = await import("./apiClient");
    expect(readOnly.USE_BACKEND).toBe(true);
    expect(readOnly.AUTH_GATE_ENABLED).toBe(false);
  });
});
