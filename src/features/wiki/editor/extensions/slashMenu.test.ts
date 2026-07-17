import { describe, expect, it } from "vitest";
import { SLASH_ITEMS, filterSlashItems } from "./slashMenu";
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
});
