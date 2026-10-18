import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { listWatches, unwatchMany } from "./wikiApi";

afterEach(() => vi.restoreAllMocks());

/* F-06 계약: GET /api/wiki/watches, POST /api/wiki/watches/unwatch {pageIds, spaceIds} → 204 */
describe("wikiApi 구독 목록", () => {
  it("응답을 string id로 매핑하고, hidden 항목의 제목은 화면에 흘리지 않는다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(new Response(JSON.stringify({
      pages: [
        { pageId: 1, spaceId: 2, title: "보임", spaceName: "개발", hidden: false },
        { pageId: 3, spaceId: 2, title: "새면 안 됨", spaceName: "개발", hidden: true },
      ],
      spaces: [{ spaceId: 2, name: "개발", hidden: false }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const list = await listWatches();
    expect(list.pages).toEqual([
      { pageId: "1", spaceId: "2", title: "보임", spaceName: "개발", hidden: false },
      { pageId: "3", spaceId: "2", title: null, spaceName: null, hidden: true },
    ]);
    expect(list.spaces).toEqual([{ spaceId: "2", name: "개발", hidden: false }]);
  });

  it("해제는 숫자 id 배열을 한 번에 보낸다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(new Response(null, { status: 204 }));
    await unwatchMany({ pageIds: ["1", "3"], spaceIds: ["2"] });
    expect(spy.mock.calls[0][0]).toBe("/api/wiki/watches/unwatch");
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({ pageIds: [1, 3], spaceIds: [2] });
  });
});
