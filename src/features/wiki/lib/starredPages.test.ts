import { beforeEach, describe, expect, it } from "vitest";
import {
  getStarredPageEntries,
  getStarredPages,
  hydrateStarredPages,
  pruneStarredPages,
  removeStarredPage,
  setStarredPageEntries,
} from "./starredPages";

const KEY = "wiki.ui.starredPages";

beforeEach(() => {
  localStorage.clear();
});

describe("starredPages v2 — 메타데이터 스냅샷", () => {
  it("엔트리를 저장하면 id·spaceId·title·type이 그대로 복원된다", () => {
    setStarredPageEntries([{ id: "pg1", spaceId: "sp1", title: "시작하기", type: "page" }]);
    expect(getStarredPageEntries()).toEqual([
      { id: "pg1", spaceId: "sp1", title: "시작하기", icon: null, type: "page" },
    ]);
    expect(getStarredPages()).toEqual(["pg1"]);
  });

  it("구버전(문자열 배열) 저장분은 메타 없는 엔트리로 승격된다", () => {
    localStorage.setItem(KEY, JSON.stringify(["pg1", "pg2"]));
    expect(getStarredPageEntries()).toEqual([
      { id: "pg1", spaceId: "", title: "" },
      { id: "pg2", spaceId: "", title: "" },
    ]);
    expect(getStarredPages()).toEqual(["pg1", "pg2"]);
  });

  it("hydrate가 개명·이모지·타입을 반영하고 구버전 엔트리의 메타를 채운다", () => {
    localStorage.setItem(KEY, JSON.stringify(["pg1"]));
    hydrateStarredPages("sp1", [{ id: "pg1", title: "새 제목", icon: "🚀", type: "page" }]);
    expect(getStarredPageEntries()).toEqual([
      { id: "pg1", spaceId: "sp1", title: "새 제목", icon: "🚀", type: "page" },
    ]);
  });

  it("hydrate는 이 스페이스에 없는 별표를 건드리지 않는다", () => {
    setStarredPageEntries([
      { id: "other", spaceId: "sp2", title: "다른 스페이스 문서" },
      { id: "pg1", spaceId: "sp1", title: "옛 제목" },
    ]);
    hydrateStarredPages("sp1", [{ id: "pg1", title: "새 제목" }]);
    const entries = getStarredPageEntries();
    expect(entries.find((e) => e.id === "other")?.title).toBe("다른 스페이스 문서");
    expect(entries.find((e) => e.id === "pg1")?.title).toBe("새 제목");
  });

  it("prune/remove가 엔트리 기준으로 동작한다", () => {
    setStarredPageEntries([
      { id: "pg1", spaceId: "sp1", title: "a" },
      { id: "pg2", spaceId: "sp1", title: "b" },
    ]);
    pruneStarredPages(["pg2"]);
    expect(getStarredPages()).toEqual(["pg2"]);
    removeStarredPage("pg2");
    expect(getStarredPages()).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
