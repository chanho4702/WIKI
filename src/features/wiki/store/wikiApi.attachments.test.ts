import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

function once(status: number, body: unknown) {
  return vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}
afterEach(() => vi.restoreAllMocks());

describe("wikiApi attachments", () => {
  it("listAttachments → AttachmentResponse[]를 Attachment[]로 매핑(id string, pageId 주입)", async () => {
    once(200, [{ id: 3, filename: "a.png", contentType: "image/png", sizeBytes: 10 }]);
    const { listAttachments } = await import("./wikiApi");
    const list = await listAttachments("2");
    expect(list[0]).toMatchObject({ id: "3", pageId: "2", filename: "a.png", contentType: "image/png", sizeBytes: 10 });
  });

  it("uploadAttachment → multipart FormData로 POST(Content-Type 헤더 미지정 — 브라우저가 boundary를 채움)", async () => {
    const spy = once(200, { id: 4, filename: "b.txt", contentType: "text/plain", sizeBytes: 5 });
    const { uploadAttachment } = await import("./wikiApi");
    const file = new File(["hello"], "b.txt", { type: "text/plain" });
    const att = await uploadAttachment("2", file);

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/wiki/pages/2/attachments");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("file")).toBe(file);
    // Content-Type을 명시하면 브라우저가 multipart boundary를 못 채운다 — 헤더 자체가 없어야 한다.
    expect(init?.headers).toBeUndefined();

    expect(att).toMatchObject({ id: "4", pageId: "2", filename: "b.txt", contentType: "text/plain", sizeBytes: 5 });
  });

  it("attachmentUrl → fetch 없이 다운로드 URL 문자열만 생성", () => {
    const spy = vi.spyOn(client, "sharedApiFetch");
    // 동적 import는 위 테스트들에서 이미 캐시됨 — 여기선 require 스타일로 동기 검증
    return import("./wikiApi").then(({ attachmentUrl }) => {
      expect(attachmentUrl("7")).toBe("/api/wiki/attachments/7");
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it("deleteAttachment → DELETE 호출", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { deleteAttachment } = await import("./wikiApi");
    await deleteAttachment("9");
    expect(spy).toHaveBeenCalledWith("/api/wiki/attachments/9", { method: "DELETE" });
  });
});
