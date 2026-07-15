import { describe, expect, it } from "vitest";
import type { Page } from "../store/types";
import { resolveWikiLinks } from "./wikiLinks";

const base = {
  spaceId: "sp1",
  parentId: null,
  body: "",
  position: 1,
  createdBy: "u1",
  updatedBy: "u1",
  createdAt: "2026-07-10T09:00:00.000Z",
  updatedAt: "2026-07-10T09:00:00.000Z",
};
const PAGES: Page[] = [
  { ...base, id: "pg1", title: "시작하기" },
  { ...base, id: "pg2", title: "팀 규칙" },
];

describe("resolveWikiLinks", () => {
  it("존재하는 제목은 페이지 경로 링크로 바꾼다", () => {
    expect(resolveWikiLinks("[[시작하기]] 참고", PAGES, "sp1")).toBe(
      "[시작하기](/spaces/sp1/pages/pg1) 참고",
    );
  });

  it("제목 매칭은 대소문자·양끝 공백을 무시한다", () => {
    const pages: Page[] = [{ ...base, id: "pgX", title: "API Guide" }];
    expect(resolveWikiLinks("[[ api guide ]]", pages, "sp1")).toBe(
      "[api guide](/spaces/sp1/pages/pgX)",
    );
  });

  it("없는 제목은 생성 화면 링크(title 프리필)로 바꾼다", () => {
    expect(resolveWikiLinks("[[운영 런북]]", PAGES, "sp1")).toBe(
      `[운영 런북](/spaces/sp1/pages/new?title=${encodeURIComponent("운영 런북")})`,
    );
  });

  it("인라인 코드와 코드 펜스 안은 치환하지 않는다", () => {
    const md = "`[[시작하기]]` 그리고\n```\n[[시작하기]]\n```\n[[시작하기]]";
    expect(resolveWikiLinks(md, PAGES, "sp1")).toBe(
      "`[[시작하기]]` 그리고\n```\n[[시작하기]]\n```\n[시작하기](/spaces/sp1/pages/pg1)",
    );
  });

  it("중복 제목은 첫 페이지로 링크한다", () => {
    const pages: Page[] = [
      { ...base, id: "pgA", title: "중복" },
      { ...base, id: "pgB", title: "중복" },
    ];
    expect(resolveWikiLinks("[[중복]]", pages, "sp1")).toBe("[중복](/spaces/sp1/pages/pgA)");
  });
});
