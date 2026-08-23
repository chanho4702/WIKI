import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "./base";
import { TocDecoration } from "./tocDecoration";

function editorWith(content: string) {
  return new Editor({
    extensions: [...buildBaseExtensions(), TocDecoration],
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: content }] }] },
  });
}

describe("TocDecoration — `::toc` 라이브 프리뷰", () => {
  it("`::toc` 단독 문단에 칩 클래스를 입힌다", () => {
    const editor = editorWith("::toc");
    try {
      expect(editor.view.dom.querySelector("p.toc-marker")).not.toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("본문 속 ::toc 언급이나 다른 텍스트에는 입히지 않는다", () => {
    const editor = editorWith("이 문서에서 ::toc 문법을 설명한다");
    try {
      expect(editor.view.dom.querySelector(".toc-marker")).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});
