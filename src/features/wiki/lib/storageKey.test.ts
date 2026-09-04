import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/wiki/`와 `/docs/`는 같은 오리진이라 localStorage를 공유한다 — 정체성을 담는 키는
 * 읽기 전용 빌드에서 갈라져야 한다. 빌드 상수라 stubEnv 후 resetModules로 다시 읽는다.
 */
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** 읽기 전용 빌드로 모듈을 다시 평가한다. */
async function loadAsDocs<T>(path: string): Promise<T> {
  vi.stubEnv("VITE_WIKI_READONLY", "true");
  vi.resetModules();
  return (await import(/* @vite-ignore */ path)) as T;
}

describe("scopedStorageKey", () => {
  it("팀 위키 빌드는 기존 키를 그대로 쓴다 — 쓰던 사람의 데이터가 초기화되면 안 된다", async () => {
    const { scopedStorageKey } = await import("./storageKey");
    expect(scopedStorageKey("wiki.ui.recentVisits")).toBe("wiki.ui.recentVisits");
    expect(scopedStorageKey("wiki.ui.starredSpaces")).toBe("wiki.ui.starredSpaces");
  });

  it("읽기 전용 빌드는 docs. 접두사를 붙인다", async () => {
    const { scopedStorageKey } = await loadAsDocs<typeof import("./storageKey")>("./storageKey");
    expect(scopedStorageKey("wiki.ui.recentVisits")).toBe("docs.wiki.ui.recentVisits");
    expect(scopedStorageKey("wiki.ui.starredSpaces")).toBe("docs.wiki.ui.starredSpaces");
  });
});

describe("최근 방문 기록의 저장 위치", () => {
  it("팀 위키 빌드는 wiki.ui.recentVisits에 쌓는다", async () => {
    const { recordVisit } = await import("./recentVisits");
    recordVisit("pg1");

    expect(localStorage.getItem("wiki.ui.recentVisits")).toContain("pg1");
    expect(localStorage.getItem("docs.wiki.ui.recentVisits")).toBeNull();
  });

  it("읽기 전용 빌드는 다른 키에 쌓고 팀 위키 기록을 건드리지 않는다", async () => {
    // 팀 위키에서 읽은 비공개 문서 기록이 이미 있는 상태
    localStorage.setItem(
      "wiki.ui.recentVisits",
      JSON.stringify([{ id: "secret-page", at: new Date().toISOString() }]),
    );

    const { getRecentVisits, recordVisit } =
      await loadAsDocs<typeof import("./recentVisits")>("./recentVisits");
    recordVisit("docs-1");

    expect(localStorage.getItem("docs.wiki.ui.recentVisits")).toContain("docs-1");
    // 공개 화면은 팀 위키 기록을 읽지 못한다 — docs DB에 없는 id라 링크도 깨진다
    expect(getRecentVisits().map((v) => v.id)).toEqual(["docs-1"]);
    // 팀 위키 쪽 기록은 그대로 남는다
    expect(localStorage.getItem("wiki.ui.recentVisits")).toContain("secret-page");
  });
});

describe("별표 목록의 저장 위치", () => {
  it("읽기 전용 빌드는 팀 위키의 별표 스페이스·페이지를 읽지 않는다", async () => {
    localStorage.setItem("wiki.ui.starredSpaces", JSON.stringify(["sp-private"]));
    localStorage.setItem(
      "wiki.ui.starredPages",
      JSON.stringify([{ id: "pg-private", spaceId: "sp-private", title: "비공개 문서" }]),
    );

    const spaces = await loadAsDocs<typeof import("./starredSpaces")>("./starredSpaces");
    const pages = await import("./starredPages");

    expect(spaces.getStarredSpaces()).toEqual([]);
    expect(pages.getStarredPageEntries()).toEqual([]);
    // 원본은 보존된다
    expect(localStorage.getItem("wiki.ui.starredSpaces")).toContain("sp-private");
  });
});
