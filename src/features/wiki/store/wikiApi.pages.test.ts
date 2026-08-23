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
  it("listPages → GET tree를 Page[]로(서버 position 없으면 index+1 폴백)", async () => {
    mockSeq([{ status: 200, body: [{ id: 1, parentId: null, title: "A" }] }]);
    const { listPages } = await import("./wikiApi");
    const pages = await listPages("5");
    expect(pages[0]).toMatchObject({ id: "1", parentId: null, position: 1 });
  });

  it("비대화형 updatePage는 getPage로 version을 읽어 PUT expectedVersion에 넣는다", async () => {
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

  it("편집 세션 expectedVersion은 저장 직전 조회한 최신 version으로 바꾸지 않는다", async () => {
    const spy = mockSeq([
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "서버", content: "server", version: 5 } },
      { status: 409, body: { error: "버전 충돌" } },
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "서버", content: "server", version: 5 } },
    ]);
    const { updatePage } = await import("./wikiApi");
    const { PageConflictError } = await import("./types");

    let conflict: unknown;
    try {
      await updatePage("1", { title: "내 편집", body: "local" }, { expectedVersion: 4 });
    } catch (error) {
      conflict = error;
    }

    expect(conflict).toBeInstanceOf(PageConflictError);
    const putBody = JSON.parse(spy.mock.calls[1][1]!.body as string);
    expect(putBody).toMatchObject({ expectedVersion: 4, title: "내 편집", content: "local" });
    expect((conflict as InstanceType<typeof PageConflictError>).serverPage).toMatchObject({
      title: "서버",
      body: "server",
      version: 5,
    });
  });

  it("PUT 409는 충돌 한국어 에러", async () => {
    mockSeq([
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "T", content: "o", version: 4 } },
      { status: 409, body: { error: "" } },
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "T", content: "o", version: 4 } },
    ]);
    const { updatePage } = await import("./wikiApi");
    await expect(updatePage("1", { title: "X", body: "y" })).rejects.toThrow(/다른 사용자/);
  });

  // ── 백엔드 V2 계약 (폴더·초안·자식 처리) ──

  it("createPage는 type/status를 요청에 싣는다", async () => {
    const spy = mockSeq([
      { status: 201, body: { id: 9, spaceId: 5, parentId: null, title: "폴더", content: "", version: 1, type: "folder", status: "published" } },
    ]);
    const { createPage } = await import("./wikiApi");
    const created = await createPage({ spaceId: "5", title: "폴더", type: "folder" });

    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toMatchObject({ type: "folder" });
    expect(created).toMatchObject({ type: "folder", status: "published" });
  });

  it("mapPage는 응답의 type/status를 읽고, 없으면 page/published로 읽는다", async () => {
    mockSeq([
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "T", content: "", version: 1, type: "folder", status: "draft" } },
      { status: 200, body: { id: 2, spaceId: 5, parentId: null, title: "T", content: "", version: 1 } }, // V2 이전 응답
    ]);
    const { getPage } = await import("./wikiApi");
    expect(await getPage("1")).toMatchObject({ type: "folder", status: "draft" });
    expect(await getPage("2")).toMatchObject({ type: "page", status: "published" });
  });

  it("publishPage는 publish 엔드포인트를 POST한다", async () => {
    const spy = mockSeq([
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "T", content: "", version: 1, type: "page", status: "published" } },
    ]);
    const { publishPage } = await import("./wikiApi");
    const published = await publishPage("1");

    expect(spy.mock.calls[0][0]).toBe("/api/wiki/pages/1/publish");
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(published.status).toBe("published");
  });

  it("deletePage는 children 옵션을 쿼리로 넘기고, 옵션이 없으면 붙이지 않는다", async () => {
    // 실제 서버는 204지만 Response 생성자가 204에 본문을 허용하지 않는다 — 검증 대상은 URL이다
    const spy = mockSeq([
      { status: 200, body: null },
      { status: 200, body: null },
      { status: 200, body: null },
    ]);
    const { deletePage } = await import("./wikiApi");
    await deletePage("1");
    await deletePage("1", { children: "promote" });
    await deletePage("1", { children: "cascade" });

    expect(spy.mock.calls[0][0]).toBe("/api/wiki/pages/1");
    expect(spy.mock.calls[1][0]).toBe("/api/wiki/pages/1?children=promote");
    expect(spy.mock.calls[2][0]).toBe("/api/wiki/pages/1?children=cascade");
  });

  it("자식이 있는데 옵션 없이 지우면 서버 409 문구를 그대로 올린다", async () => {
    mockSeq([{ status: 409, body: { error: "하위 페이지가 있어 삭제할 수 없습니다" } }]);
    const { deletePage } = await import("./wikiApi");
    await expect(deletePage("1")).rejects.toThrow("하위 페이지가 있어 삭제할 수 없습니다");
  });
});

describe("wikiApi.movePage — V9 전용 move 엔드포인트", () => {
  it("POST /move에 parentId·beforeId를 숫자로 보내고 응답 position을 매핑한다", async () => {
    const spy = mockSeq([{
      status: 200,
      body: { id: 3, spaceId: 1, parentId: 2, title: "이동됨", content: "", version: 1, position: 1 },
    }]);
    const { movePage } = await import("./wikiApi");

    const moved = await movePage("3", { parentId: "2", beforeId: "5" });

    expect(spy).toHaveBeenCalledWith(
      "/api/wiki/pages/3/move",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({ parentId: 2, beforeId: 5, spaceId: null, children: null });
    expect(moved).toMatchObject({ parentId: "2", position: 1, version: 1 });
  });

  it("루트 이동은 parentId null, beforeId 생략은 null로 보낸다", async () => {
    const spy = mockSeq([{
      status: 200,
      body: { id: 3, spaceId: 1, parentId: null, title: "이동됨", content: "", version: 1, position: 2 },
    }]);
    const { movePage } = await import("./wikiApi");
    await movePage("3", { parentId: null });
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({ parentId: null, beforeId: null, spaceId: null, children: null });
  });

  it("서버 position이 있으면 트리 매핑이 그것을 쓴다", async () => {
    mockSeq([{
      status: 200,
      body: [
        { id: 1, parentId: null, title: "B", position: 2 },
        { id: 2, parentId: null, title: "A", position: 1 },
      ],
    }]);
    const { listPages } = await import("./wikiApi");
    const pages = await listPages("1");
    expect(pages.find((p) => p.title === "A")?.position).toBe(1);
    expect(pages.find((p) => p.title === "B")?.position).toBe(2);
  });
});

