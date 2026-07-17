import { describe, expect, it } from "vitest";
import { SLASH_ITEMS, filterSlashItems, isInsideOpenWikiLink } from "./slashMenu";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "./base";

describe("슬래시 메뉴", () => {
  it("전체 항목 — 화이트리스트 블록과 일치", () => {
    expect(SLASH_ITEMS.map((i) => i.id)).toEqual([
      "h1", "h2", "h3", "bullet", "ordered", "task", "quote", "code", "divider", "table", "image",
    ]);
  });

  it("한글 라벨 필터", () => {
    expect(filterSlashItems("제목").map((i) => i.id)).toEqual(["h1", "h2", "h3"]);
    expect(filterSlashItems("표").map((i) => i.id)).toEqual(["table"]);
  });

  it("run(h1)은 현재 블록을 제목1로 바꾼다", () => {
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    SLASH_ITEMS.find((i) => i.id === "h1")!.run(editor);
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("# 본문");
    editor.destroy();
  });

  // 회귀: 리뷰어 Important — [[ 쿼리(공백 허용) 안에 "/"가 오면 wikiLinkSuggestion과
  // slashMenu가 동시에 활성화돼 팝업이 겹쳤다. slashMenu의 allow는 이 함수로 활성화를 거부한다.
  describe("isInsideOpenWikiLink — [[ 쿼리 안에서는 슬래시 메뉴를 막는다", () => {
    it("열린 [[ 런 안(공백 포함)이면 true", () => {
      expect(isInsideOpenWikiLink("[[운영 ")).toBe(true);
      expect(isInsideOpenWikiLink("메모: [[운영 가이드")).toBe(true);
    });

    it("[[가 ]]로 닫혔으면 false", () => {
      expect(isInsideOpenWikiLink("[[운영]] ")).toBe(false);
    });

    it("[[가 아예 없으면 false", () => {
      expect(isInsideOpenWikiLink("일반 텍스트")).toBe(false);
    });

    it("개행을 건너 [[가 있었다면(다른 줄) false", () => {
      expect(isInsideOpenWikiLink("[[운영\n")).toBe(false);
    });
  });
});
