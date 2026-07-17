import { describe, expect, it } from "vitest";
import { filterLinkCandidates } from "./wikiLinkSuggestion";
import type { Page } from "../../store/types";

const page = (id: string, title: string): Page => ({
  id, spaceId: "s1", parentId: null, title, body: "", position: 0,
  createdBy: "u1", updatedBy: "u1", createdAt: "", updatedAt: "",
});

describe("filterLinkCandidates", () => {
  const pages = [
    page("1", "운영 런북"), page("2", "운영 가이드"), page("3", "개발 환경"),
    page("4", "대괄호[포함]"), page("5", "개행\n포함"),
  ];

  it("부분 일치 필터", () => {
    expect(filterLinkCandidates(pages, "운영").map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("빈 쿼리는 전체(제외 규칙 적용)", () => {
    expect(filterLinkCandidates(pages, "").map((p) => p.id)).toEqual(["1", "2", "3"]);
  });

  it("[, ], 개행 포함 제목 제외", () => {
    const ids = filterLinkCandidates(pages, "").map((p) => p.id);
    expect(ids).not.toContain("4");
    expect(ids).not.toContain("5");
  });

  it("최대 8개", () => {
    const many = Array.from({ length: 12 }, (_, i) => page(`m${i}`, `문서 ${i}`));
    expect(filterLinkCandidates(many, "문서")).toHaveLength(8);
  });
});
