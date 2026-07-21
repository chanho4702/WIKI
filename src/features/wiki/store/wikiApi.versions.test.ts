import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

function once(status: number, body: unknown) {
  return vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}
afterEach(() => vi.restoreAllMocks());

describe("wikiApi versions", () => {
  it("listVersions → RevisionMeta[]를 PageVersion[]로(savedBy=editedBy)", async () => {
    once(200, [{ version: 2, editedBy: 9, createdAt: "2026-07-20T00:00:00Z" }]);
    const { listVersions } = await import("./wikiApi");
    const vs = await listVersions("3");
    expect(vs[0]).toMatchObject({ pageId: "3", version: 2, savedBy: "9", savedAt: "2026-07-20T00:00:00Z" });
  });

  it("restoreVersion → 합성 id에서 버전 번호를 파싱해 restore 엔드포인트를 호출", async () => {
    const spy = once(200, { id: 3, spaceId: 1, parentId: null, title: "복원됨", content: "본문", version: 5 });
    const { restoreVersion } = await import("./wikiApi");
    const page = await restoreVersion("3", "3:2");
    expect(spy).toHaveBeenCalledWith("/api/wiki/pages/3/revisions/2/restore", { method: "POST" });
    expect(page).toMatchObject({ id: "3", title: "복원됨", body: "본문", version: 5 });
  });
});
