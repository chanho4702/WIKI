import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

function mockSeq(responses: Array<{ status: number; body: unknown }>) {
  const spy = vi.spyOn(client, "sharedApiFetch");
  for (const r of responses) {
    spy.mockResolvedValueOnce(new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } }));
  }
  return spy;
}
afterEach(() => vi.restoreAllMocks());

describe("wikiApi pages", () => {
  it("listPages → GET tree를 Page[]로(position=index+1)", async () => {
    mockSeq([{ status: 200, body: [{ id: 1, parentId: null, title: "A" }] }]);
    const { listPages } = await import("./wikiApi");
    const pages = await listPages("5");
    expect(pages[0]).toMatchObject({ id: "1", parentId: null, position: 1 });
  });

  it("updatePage는 getPage로 version을 읽어 PUT expectedVersion에 넣는다", async () => {
    const spy = mockSeq([
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "T", content: "old", version: 4 } }, // getPage
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "T2", content: "new", version: 5 } }, // put
    ]);
    const { updatePage } = await import("./wikiApi");
    const saved = await updatePage("1", { title: "T2", body: "new" });
    expect(saved).toMatchObject({ title: "T2", body: "new", version: 5 });
    const putInit = spy.mock.calls[1][1]!;
    expect(JSON.parse(putInit.body as string)).toMatchObject({ expectedVersion: 4 });
  });

  it("PUT 409는 충돌 한국어 에러", async () => {
    mockSeq([
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "T", content: "o", version: 4 } },
      { status: 409, body: { error: "" } },
    ]);
    const { updatePage } = await import("./wikiApi");
    await expect(updatePage("1", { title: "X", body: "y" })).rejects.toThrow(/다른 사용자/);
  });
});
