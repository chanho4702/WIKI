import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { parseMarkdown, serializeMarkdown } from "../markdown";

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
});
