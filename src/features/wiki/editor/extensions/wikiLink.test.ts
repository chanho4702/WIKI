import { describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { buildBaseExtensions } from "./base";

function findNodes(doc: JSONContent, type: string): JSONContent[] {
  const found: JSONContent[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === type) found.push(node);
    node.content?.forEach(walk);
  };
  walk(doc);
  return found;
}

describe("wikiLink 노드", () => {
  it("[[제목]]을 wikiLink 노드로 파싱한다", () => {
    const doc = parseMarkdown("앞 [[운영 런북]] 뒤");
    const links = findNodes(doc, "wikiLink");
    expect(links).toHaveLength(1);
    expect(links[0].attrs?.title).toBe("운영 런북");
  });

  it("코드 블록 안의 [[제목]]은 노드로 만들지 않는다", () => {
    const doc = parseMarkdown("```\n[[코드속]]\n```");
    expect(findNodes(doc, "wikiLink")).toHaveLength(0);
  });

  it("인라인 코드 안의 [[제목]]도 제외한다", () => {
    const doc = parseMarkdown("`[[코드]]` 텍스트");
    expect(findNodes(doc, "wikiLink")).toHaveLength(0);
  });

  it("wikiLink 노드는 [[제목]]으로 직렬화된다 — 왕복 보존", () => {
    const md = "앞 [[운영 런북]] 뒤";
    expect(serializeMarkdown(parseMarkdown(md)).trim()).toBe(md);
  });

  it("한 문단에 여러 링크", () => {
    const doc = parseMarkdown("[[A]]와 [[B]] 비교");
    expect(findNodes(doc, "wikiLink").map((n) => n.attrs?.title)).toEqual(["A", "B"]);
  });

  it("굵게 마크 안의 [[제목]]도 승격 시 마크를 유지한 채 왕복 보존된다 (회귀)", () => {
    const md = "**[[운영 런북]]** 뒤";
    const doc = parseMarkdown(md);
    const [link] = findNodes(doc, "wikiLink");
    expect(link.marks?.some((m) => m.type === "bold")).toBe(true);
    expect(serializeMarkdown(doc).trim()).toBe(md);
  });

  it("존재 판정은 제목의 앞뒤 공백·대소문자를 무시한다 (회귀)", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const editor = new Editor({
      element: el,
      extensions: buildBaseExtensions({
        getPages: () => [
          { id: "p1", spaceId: "s1", parentId: null, title: " 운영 런북 ", body: "", position: 0, createdBy: "u", updatedBy: "u", createdAt: "", updatedAt: "" },
        ],
      }),
      content: "<p></p>",
    });
    editor.commands.insertContent({
      type: "paragraph",
      content: [{ type: "wikiLink", attrs: { title: "운영 런북" } }],
    });
    const missing = el.querySelectorAll(".wiki-chip-missing");
    editor.destroy();
    expect(missing).toHaveLength(0);
  });
});
