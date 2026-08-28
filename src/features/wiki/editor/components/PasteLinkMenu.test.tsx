import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "../extensions/base";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { PasteLinkMenu, fallbackTitleOf, internalPageIdOf } from "./PasteLinkMenu";
import { __resetForTest } from "../../store/wikiStore";
import { createSeedData } from "../../../../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

function makeEditorWithUrl(url: string) {
  const editor = new Editor({
    extensions: buildBaseExtensions(),
    content: parseMarkdown(`[${url}](${url})`),
  });
  return { editor, info: { url, from: 1, to: 1 + url.length } };
}

describe("PasteLinkMenu — URL 붙여넣기 형식", () => {
  it("내부 페이지 URL 판별과 외부 호스트명 폴백", () => {
    expect(internalPageIdOf(`${window.location.origin}/wiki/spaces/sp1/pages/pg1`)).toBe("pg1");
    expect(internalPageIdOf("https://external.com/wiki/spaces/sp1/pages/pg1")).toBeNull();
    expect(fallbackTitleOf("https://www.github.com/foo/bar")).toBe("github.com");
  });

  it("인라인(외부) — URL 텍스트가 호스트명 링크로 바뀐다", () => {
    const url = "https://www.github.com/foo/bar";
    const { editor, info } = makeEditorWithUrl(url);
    render(
      <PasteLinkMenu editor={editor} info={info} anchor={{ left: 0, bottom: 0 }} onClose={() => {}} />,
    );
    fireEvent.mouseDown(screen.getByRole("button", { name: /인라인/ }));
    const md = serializeMarkdown(editor.getJSON());
    expect(md.trim()).toBe(`[github.com](${url})`);
    editor.destroy();
  });

  /** 제목은 서버(목업 스토어)에서 읽는다 — 화면이 스페이스 전량을 들고 있지 않다(2026-08-28). */
  it("인라인(내부) — 제목을 조회해 [[위키링크]]로 바꾼다", async () => {
    const url = `${window.location.origin}/wiki/spaces/sp1/pages/pg1`;
    const { editor, info } = makeEditorWithUrl(url);
    render(
      <PasteLinkMenu editor={editor} info={info} anchor={{ left: 0, bottom: 0 }} onClose={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /시작하기/ })).toBeInTheDocument();
    });
    fireEvent.mouseDown(screen.getByRole("button", { name: /인라인/ }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("[[시작하기]]");
    editor.destroy();
  });

  it("카드 — ::bookmark 지시자로 바뀐다", () => {
    const url = "https://example.com/docs";
    const { editor, info } = makeEditorWithUrl(url);
    render(
      <PasteLinkMenu editor={editor} info={info} anchor={{ left: 0, bottom: 0 }} onClose={() => {}} />,
    );
    fireEvent.mouseDown(screen.getByRole("button", { name: /카드/ }));
    const md = serializeMarkdown(editor.getJSON());
    expect(md).toContain('::bookmark{url="https://example.com/docs" title="example.com"}');
    editor.destroy();
  });
});
