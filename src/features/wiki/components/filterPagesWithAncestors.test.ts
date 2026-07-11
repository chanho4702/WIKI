import { describe, expect, it } from "vitest";
import type { Page } from "../store/types";
import { filterPagesWithAncestors } from "./filterPagesWithAncestors";

const T = "2026-07-01T00:00:00.000Z";

function makePage(id: string, title: string, parentId: string | null, position = 1): Page {
  return {
    id, spaceId: "sp1", parentId, title, body: "", position,
    createdBy: "u1", updatedBy: "u1", createdAt: T, updatedAt: T,
  };
}

// 시드와 동일한 계층: pg1 ─ pg3 ─ pg5 / pg1 ─ pg4 / pg2
const PAGES: Page[] = [
  makePage("pg1", "시작하기", null, 1),
  makePage("pg2", "팀 규칙", null, 2),
  makePage("pg3", "개발 환경 설정", "pg1", 1),
  makePage("pg4", "배포 가이드", "pg1", 2),
  makePage("pg5", "로컬 DB 설정", "pg3", 1),
];

describe("filterPagesWithAncestors", () => {
  it("빈 검색어(공백만 포함)는 원본 배열을 그대로 반환한다", () => {
    expect(filterPagesWithAncestors(PAGES, "")).toBe(PAGES);
    expect(filterPagesWithAncestors(PAGES, "   ")).toBe(PAGES);
  });

  it("매치된 페이지와 조상 체인만 남긴다 — '설정'은 pg3·pg5와 조상 pg1", () => {
    const result = filterPagesWithAncestors(PAGES, "설정");
    expect(result.map((p) => p.id)).toEqual(["pg1", "pg3", "pg5"]);
  });

  it("대소문자를 무시하고 부분일치한다", () => {
    const pages = [makePage("a", "API Guide", null)];
    expect(filterPagesWithAncestors(pages, "api")).toHaveLength(1);
    expect(filterPagesWithAncestors(pages, "GUIDE")).toHaveLength(1);
  });

  it("매치가 없으면 빈 배열을 반환한다", () => {
    expect(filterPagesWithAncestors(PAGES, "존재하지않는제목")).toEqual([]);
  });

  it("루트가 직접 매치되면 하위는 포함하지 않는다", () => {
    const result = filterPagesWithAncestors(PAGES, "시작하기");
    expect(result.map((p) => p.id)).toEqual(["pg1"]);
  });

  it("순환 parentId 데이터에서도 멈추지 않는다", () => {
    const cyclic = [makePage("a", "순환 설정 A", "b"), makePage("b", "순환 B", "a")];
    const result = filterPagesWithAncestors(cyclic, "설정");
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
  });
});
