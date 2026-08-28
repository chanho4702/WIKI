import { beforeEach, describe, expect, it } from "vitest";
import { orderSubtree, buildMarkdownExport, countForExport, toFileName } from "./exportContent";
import { __resetForTest, getPage, listDescendants } from "../store/wikiStore";
import { createSeedData } from "../../../mock/seed";
import type { PageNode } from "../store/types";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

function node(id: string, parentId: string | null, position: number): PageNode {
  return {
    id,
    parentId,
    title: id,
    type: "page",
    status: "published",
    position,
    icon: null,
    childCount: 0,
  };
}

describe("W21-3 내보내기", () => {
  it("하위 포함이 아니면 대상 문서 하나만 담는다", async () => {
    const root = (await getPage("pg1"))!;

    expect(await countForExport(root, false)).toBe(1);
  });

  /** 서버는 후손의 순서를 보장하지 않는다 — 문서 순서는 여기서 다시 세운다. */
  it("후손을 트리 순서(깊이 우선 · position 순)로 편다", async () => {
    // pg1 > pg3 > pg5, pg1 > pg4
    const descendants = await listDescendants("pg1");

    expect(orderSubtree("pg1", descendants).map((p) => p.id)).toEqual(["pg3", "pg5", "pg4"]);
  });

  it("서버가 뒤섞어 줘도 같은 순서로 편다", () => {
    const shuffled = [node("c", "a", 2), node("b", null, 1), node("a", null, 1), node("d", "b", 1)];

    expect(orderSubtree("", shuffled).map((p) => p.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("순환 데이터에서도 같은 문서를 두 번 담지 않는다", () => {
    const a = node("a", "b", 1);
    const b = node("b", "a", 1);

    expect(orderSubtree("a", [a, b]).map((p) => p.id)).toEqual(["b"]);
  });

  it("하위 포함 개수는 루트를 더해서 센다", async () => {
    const root = (await getPage("pg1"))!;

    expect(await countForExport(root, true)).toBe(4);
  });

  it("Markdown 내보내기는 제목을 h1로 얹고 문서를 구분선으로 잇는다", async () => {
    const root = (await getPage("pg3"))!;

    const markdown = await buildMarkdownExport({ root, includeChildren: true });

    expect(markdown).toContain("# 개발 환경 설정");
    expect(markdown).toContain("# 로컬 DB 설정");
    expect(markdown).toContain(["", "---", ""].join("\n"));
  });

  it("파일명에서 경로 문자를 지운다", () => {
    expect(toFileName("배포/가이드: 1편", "md")).toBe("배포가이드 1편.md");
    expect(toFileName("   ", "html")).toBe("문서.html");
  });
});
