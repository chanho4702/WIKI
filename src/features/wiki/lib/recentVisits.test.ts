import { beforeEach, describe, expect, it } from "vitest";
import { getRecentVisits, recordVisit } from "./recentVisits";

beforeEach(() => localStorage.clear());

describe("recentVisits", () => {
  it("기록이 없으면 빈 배열", () => {
    expect(getRecentVisits()).toEqual([]);
  });

  it("방문을 기록하고 최신이 맨 앞에 온다", () => {
    recordVisit("p1");
    recordVisit("p2");
    const visits = getRecentVisits();
    expect(visits.map((v) => v.id)).toEqual(["p2", "p1"]);
    expect(visits[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO
  });

  it("같은 페이지 재방문은 중복 없이 맨 앞으로 올라간다", () => {
    recordVisit("p1");
    recordVisit("p2");
    recordVisit("p1");
    expect(getRecentVisits().map((v) => v.id)).toEqual(["p1", "p2"]);
  });

  it("limit으로 개수를 제한한다", () => {
    recordVisit("a");
    recordVisit("b");
    recordVisit("c");
    expect(getRecentVisits(2).map((v) => v.id)).toEqual(["c", "b"]);
  });

  it("손상된 저장값은 빈 배열로 방어한다", () => {
    localStorage.setItem("wiki.ui.recentVisits", "{not-an-array}");
    expect(getRecentVisits()).toEqual([]);
  });
});
