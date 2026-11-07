import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, getPage, importMarkdownFiles, listChildren } from "./wikiStore";

function md(name: string, body: string | Uint8Array) {
  return new File([body], name, { type: "text/markdown" });
}

describe("importMarkdownFiles (목업)", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetForTest();
  });

  it("파일마다 부모 아래 형제 맨 뒤에 문서를 만들고 상대 이미지는 경고로 준다", async () => {
    const result = await importMarkdownFiles("sp1", "pg1", [
      md("a.md", "# 첫 문서\n\n본문 A"),
      md("b.md", "![x](./x.png)"),
    ]);
    expect(result.pages.map((p) => p.title)).toEqual(["첫 문서", "b"]);
    expect(result.pages.every((p) => p.parentId === "pg1" && p.status === "published")).toBe(true);
    expect(result.warnings).toEqual([{ file: "b.md", message: expect.stringContaining("1개") }]);
    const children = await listChildren("sp1", "pg1");
    expect(children.slice(-2).map((c) => c.id)).toEqual(result.pages.map((p) => p.id));
    expect((await getPage(result.pages[0].id))?.body).toBe("본문 A");
  });

  it("초안으로 가져올 수 있다", async () => {
    const result = await importMarkdownFiles("sp1", null, [md("d.md", "초안")], { draft: true });
    expect(result.pages[0]).toMatchObject({ status: "draft", parentId: null });
  });

  it("하나라도 거부되면 아무것도 만들지 않는다", async () => {
    const before = (await listChildren("sp1", null)).length;
    await expect(
      importMarkdownFiles("sp1", null, [md("ok.md", "좋음"), new File(["x"], "photo.png", { type: "image/png" })]),
    ).rejects.toThrow("Markdown 파일(.md, .markdown)만 가져올 수 있습니다: photo.png");
    await expect(importMarkdownFiles("sp1", null, [md("bad.md", new Uint8Array([0xc3, 0x28]))])).rejects.toThrow(
      "UTF-8 텍스트 파일이 아닙니다: bad.md",
    );
    await expect(importMarkdownFiles("sp1", null, [])).rejects.toThrow("가져올 Markdown 파일을 선택하세요");
    await expect(
      importMarkdownFiles("sp1", null, [new File(["PK"], "docs.zip", { type: "application/zip" })]),
    ).rejects.toThrow("zip 가져오기는 백엔드 연결에서만 동작합니다");
    expect((await listChildren("sp1", null)).length).toBe(before);
  });
});
