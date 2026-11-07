import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

afterEach(() => vi.restoreAllMocks());

describe("wikiApi Markdown 가져오기 · Word 내보내기", () => {
  it("files를 multipart로, 부모·초안은 쿼리로 보내고 응답을 도메인 문서로 바꾼다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          pages: [{ id: 9, spaceId: 5, parentId: 3, title: "가져옴", content: "본문", version: 1, status: "draft" }],
          warnings: [{ file: "a.md", message: "상대 경로 이미지 1개는 가져오지 못했습니다." }],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { importMarkdownFiles } = await import("./wikiApi");
    const file = new File(["# 가져옴"], "a.md", { type: "text/markdown" });

    const result = await importMarkdownFiles("5", "3", [file], { draft: true });

    const [path, init] = spy.mock.calls[0];
    expect(path).toBe("/api/wiki/spaces/5/import/markdown?parentId=3&status=draft");
    expect(init?.method).toBe("POST");
    expect((init?.body as FormData).getAll("files")).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({ id: "9", parentId: "3", title: "가져옴", body: "본문", status: "draft" });
    expect(result.warnings[0].file).toBe("a.md");
  });

  it("zip도 같은 경로·같은 files 파트로 보낸다(서버가 트리로 푼다)", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ pages: [], warnings: [{ file: "zip", message: "어느 문서도 가리키지 않은 파일 1개는 가져오지 않았습니다." }] }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { importMarkdownFiles } = await import("./wikiApi");
    const zip = new File(["PK"], "docs.zip", { type: "application/zip" });

    const result = await importMarkdownFiles("5", null, [zip]);

    const [path, init] = spy.mock.calls[0];
    expect(path).toBe("/api/wiki/spaces/5/import/markdown");
    expect(((init?.body as FormData).get("files") as File).name).toBe("docs.zip");
    expect(result.warnings[0].file).toBe("zip");
  });

  it("거부되면 서버 오류 문구를 그대로 던진다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Markdown 파일(.md, .markdown)만 가져올 수 있습니다: x.png" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { importMarkdownFiles } = await import("./wikiApi");
    await expect(importMarkdownFiles("5", null, [new File(["x"], "x.png")])).rejects.toThrow("x.png");
  });

  it("Word 내보내기는 export.docx를 받아 제목.docx로 저장한다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(new Response(new Blob(["PK"]), { status: 200 }));
    // jsdom에는 createObjectURL이 없다 — 이 테스트 동안만 심고 원래대로 돌린다
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { downloadPageDocx } = await import("./wikiApi");

    await downloadPageDocx("7", true, "배포/안내");

    expect(spy.mock.calls[0][0]).toBe("/api/wiki/pages/7/export.docx?includeChildren=true");
    expect(click).toHaveBeenCalledTimes(1);
    expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe("배포_안내.docx");
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });
});
