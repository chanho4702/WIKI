import { describe, expect, it } from "vitest";
import type { Page } from "../store/types";
import { resolveWikiLinks, WIKI_LINK_SOURCE, WIKI_LINK_OPEN_SOURCE } from "./wikiLinks";

const base = {
  spaceId: "sp1",
  parentId: null,
  body: "",
  version: 1,
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

  it("괄호가 든 없는 제목은 괄호까지 인코딩한다 — 마크다운 링크 조기 종료 방지", () => {
    expect(resolveWikiLinks("[[7월 회의)]]", PAGES, "sp1")).toBe(
      "[7월 회의)](/spaces/sp1/pages/new?title=7%EC%9B%94%20%ED%9A%8C%EC%9D%98%29)",
    );
  });
});

describe("WIKI_LINK_SOURCE 상수", () => {
  it("WIKI_LINK_SOURCE는 닫힌 wiki link [[제목]]을 전역 플래그와 함께 매칭한다", () => {
    const regex = new RegExp(WIKI_LINK_SOURCE, "g");
    const text = "[[시작하기]] 그리고 [[팀 규칙]]";
    const matches = Array.from(text.matchAll(regex));
    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe("시작하기");
    expect(matches[1][1]).toBe("팀 규칙");
  });

  it("WIKI_LINK_SOURCE는 닫히지 않은 [[를 매칭하지 않는다", () => {
    const regex = new RegExp(WIKI_LINK_SOURCE, "g");
    expect(regex.test("[[")).toBe(false);
    expect(regex.test("[[제목")).toBe(false);
  });

  it("WIKI_LINK_SOURCE는 개행을 포함하는 제목을 매칭하지 않는다", () => {
    const regex = new RegExp(WIKI_LINK_SOURCE, "g");
    expect(regex.test("[[제목\n설명]]")).toBe(false);
  });

  it("WIKI_LINK_SOURCE는 괄호를 포함하는 제목을 매칭한다", () => {
    const regex = new RegExp(WIKI_LINK_SOURCE, "g");
    const text = "[[7월 회의)]]";
    const match = text.match(regex);
    expect(match).not.toBeNull();
    expect(match!).toHaveLength(1);
    expect(match![0]).toBe("[[7월 회의)]]");
  });

  it("WIKI_LINK_OPEN_SOURCE는 줄 끝 앵커와 함께 닫히지 않은 wiki link [[를 매칭한다", () => {
    const regex = new RegExp(WIKI_LINK_OPEN_SOURCE);
    expect(regex.test("[[")).toBe(true);
    expect(regex.test("[[제목")).toBe(true);
    expect(regex.test("[[운영 /")).toBe(true);
  });

  it("WIKI_LINK_OPEN_SOURCE는 닫힌 ]를 포함하면 매칭하지 않는다", () => {
    const regex = new RegExp(WIKI_LINK_OPEN_SOURCE);
    expect(regex.test("[[제목]]")).toBe(false);
    expect(regex.test("[[제목]")).toBe(false);
  });

  it("WIKI_LINK_OPEN_SOURCE는 개행이 있으면 매칭하지 않는다", () => {
    const regex = new RegExp(WIKI_LINK_OPEN_SOURCE);
    expect(regex.test("[[제목\n")).toBe(false);
  });
});
