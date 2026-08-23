import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "./base";
import { TocDecoration } from "./tocDecoration";

function editorWith(markdownNodes: object[]) {
  return new Editor({
    extensions: [...buildBaseExtensions(), TocDecoration],
    content: { type: "doc", content: markdownNodes },
  });
}

const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const h = (level: number, text: string) => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

describe("TocDecoration — `::toc` 라이브 목차", () => {
  it("마커 칩과 함께 현재 제목들로 목차를 즉시 그린다", () => {
    const editor = editorWith([p("::toc"), h(1, "개요"), h(2, "설치")]);
    try {
      expect(editor.view.dom.querySelector("p.toc-marker")).not.toBeNull();
      const toc = editor.view.dom.querySelector("nav.toc-live");
      expect(toc).not.toBeNull();
      const labels = [...toc!.querySelectorAll("a")].map((a) => a.textContent);
      expect(labels).toEqual(["개요", "설치"]);
    } finally {
      editor.destroy();
    }
  });

  it("제목을 추가하면 목차가 바로 갱신된다", () => {
    const editor = editorWith([p("::toc"), h(1, "개요")]);
    try {
      editor.chain().focus("end").insertContent(h(2, "새 절")).run();
      const labels = [...editor.view.dom.querySelectorAll("nav.toc-live a")].map((a) => a.textContent);
      expect(labels).toEqual(["개요", "새 절"]);
    } finally {
      editor.destroy();
    }
  });

  it("제목이 없으면 안내 문구를 보여준다", () => {
    const editor = editorWith([p("::toc")]);
    try {
      expect(editor.view.dom.querySelector("nav.toc-live .page-toc-empty")?.textContent)
        .toContain("제목을 추가하면");
    } finally {
      editor.destroy();
    }
  });

  it("본문 속 ::toc 언급(다른 텍스트 포함)에는 반응하지 않는다", () => {
    const editor = editorWith([p("이 문서에서 ::toc 문법을 설명한다")]);
    try {
      expect(editor.view.dom.querySelector(".toc-marker")).toBeNull();
      expect(editor.view.dom.querySelector("nav.toc-live")).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});
