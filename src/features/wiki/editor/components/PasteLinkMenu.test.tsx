import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "../extensions/base";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { PasteLinkMenu, fallbackTitleOf, internalPageOf } from "./PasteLinkMenu";
import type { Page } from "../../store/types";

const PAGE: Page = {
  id: "pg1", spaceId: "sp1", parentId: null, type: "page", status: "published",
  title: "배포 가이드", body: "", version: 1, position: 1,
  createdBy: "u1", updatedBy: "u1", createdAt: "", updatedAt: "",
};

function makeEditorWithUrl(url: string) {
  const editor = new Editor({
    extensions: buildBaseExtensions(),
    content: parseMarkdown(`[${url}](${url})`),
  });
  return { editor, info: { url, from: 1, to: 1 + url.length } };
}

describe("PasteLinkMenu — URL 붙여넣기 형식", () => {
  it("내부 페이지 URL 판별과 외부 호스트명 폴백", () => {
    expect(internalPageOf(`${window.location.origin}/wiki/spaces/sp1/pages/pg1`, [PAGE])?.title).toBe(
      "배포 가이드",
    );
    expect(internalPageOf("https://external.com/wiki/spaces/sp1/pages/pg1", [PAGE])).toBeNull();
    expect(fallbackTitleOf("https://www.github.com/foo/bar")).toBe("github.com");
  });

  it("인라인(외부) — URL 텍스트가 호스트명 링크로 바뀐다", () => {
    const url = "https://www.github.com/foo/bar";
    const { editor, info } = makeEditorWithUrl(url);
    render(
      <PasteLinkMenu editor={editor} info={info} pages={[]} anchor={{ left: 0, bottom: 0 }} onClose={() => {}} />,
    );
    fireEvent.mouseDown(screen.getByRole("button", { name: /인라인/ }));
    const md = serializeMarkdown(editor.getJSON());
    expect(md.trim()).toBe(`[github.com](${url})`);
    editor.destroy();
  });

  it("인라인(내부) — [[위키링크]]로 바뀐다", () => {
    const url = `${window.location.origin}/wiki/spaces/sp1/pages/pg1`;
    const { editor, info } = makeEditorWithUrl(url);
    render(
      <PasteLinkMenu editor={editor} info={info} pages={[PAGE]} anchor={{ left: 0, bottom: 0 }} onClose={() => {}} />,
    );
    fireEvent.mouseDown(screen.getByRole("button", { name: /인라인/ }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("[[배포 가이드]]");
    editor.destroy();
  });

  it("카드 — ::bookmark 지시자로 바뀐다", () => {
    const url = "https://example.com/docs";
    const { editor, info } = makeEditorWithUrl(url);
    render(
      <PasteLinkMenu editor={editor} info={info} pages={[]} anchor={{ left: 0, bottom: 0 }} onClose={() => {}} />,
    );
    fireEvent.mouseDown(screen.getByRole("button", { name: /카드/ }));
    const md = serializeMarkdown(editor.getJSON());
    expect(md).toContain('::bookmark{url="https://example.com/docs" title="example.com"}');
    editor.destroy();
  });
});
