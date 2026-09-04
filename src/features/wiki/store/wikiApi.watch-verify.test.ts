import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

function mockSeq(responses: Array<{ status: number; body: unknown }>) {
  const spy = vi.spyOn(client, "sharedApiFetch");
  for (const r of responses) {
    spy.mockResolvedValueOnce(
      new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return spy;
}
afterEach(() => vi.restoreAllMocks());

/** 백엔드 PageResponse의 최소 형태 — 매퍼가 읽는 필드만. */
const pageDto = (extra: Record<string, unknown> = {}) => ({
  id: 7,
  spaceId: 5,
  parentId: null,
  title: "운영 가이드",
  content: "본문",
  version: 3,
  ...extra,
});

describe("wikiApi 스페이스 구독 (W27-4)", () => {
  it("상태 조회는 GET /api/wiki/spaces/{id}/watch", async () => {
    const spy = mockSeq([{ status: 200, body: { watching: true } }]);
    const { getSpaceWatchState } = await import("./wikiApi");

    expect(await getSpaceWatchState("5")).toBe(true);
    expect(spy.mock.calls[0][0]).toBe("/api/wiki/spaces/5/watch");
  });

  it("켜기는 PUT, 끄기는 DELETE — 응답의 watching을 그대로 돌려준다", async () => {
    const spy = mockSeq([
      { status: 200, body: { watching: true } },
      { status: 200, body: { watching: false } },
    ]);
    const { setSpaceWatchState } = await import("./wikiApi");

    expect(await setSpaceWatchState("5", true)).toBe(true);
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "PUT" });

    expect(await setSpaceWatchState("5", false)).toBe(false);
    expect(spy.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
  });

  it("403은 서버 한국어 문구를 그대로 던진다", async () => {
    mockSeq([{ status: 403, body: { error: "VIEW 권한이 필요합니다 (space 5)" } }]);
    const { setSpaceWatchState } = await import("./wikiApi");

    await expect(setSpaceWatchState("5", true)).rejects.toThrow("VIEW 권한이 필요합니다 (space 5)");
  });
});

describe("wikiApi 소유자·검증 (W27-5)", () => {
  it("소유자 지정은 PUT /owner에 숫자 id를 보낸다", async () => {
    const spy = mockSeq([{ status: 200, body: pageDto({ ownerId: 3 }) }]);
    const { setPageOwner } = await import("./wikiApi");

    const page = await setPageOwner("7", "3");
    expect(page.ownerId).toBe("3");
    expect(spy.mock.calls[0][0]).toBe("/api/wiki/pages/7/owner");
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({ ownerId: 3 });
  });

  it("소유자 해제는 ownerId: null을 보낸다", async () => {
    const spy = mockSeq([{ status: 200, body: pageDto({ ownerId: null }) }]);
    const { setPageOwner } = await import("./wikiApi");

    const page = await setPageOwner("7", null);
    expect(page.ownerId).toBeNull();
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({ ownerId: null });
  });

  it("검증은 PUT /verification에 날짜를 보내고 서버 시각을 날짜로 잘라 읽는다", async () => {
    const spy = mockSeq([
      {
        status: 200,
        body: pageDto({
          verifiedAt: "2026-09-04T01:02:03Z",
          verifiedBy: 1,
          verifiedUntil: "2026-12-03T00:00:00Z",
        }),
      },
    ]);
    const { verifyPage } = await import("./wikiApi");

    const page = await verifyPage("7", "2026-12-03");
    expect(spy.mock.calls[0][0]).toBe("/api/wiki/pages/7/verification");
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({ verifiedUntil: "2026-12-03" });
    // 화면은 날짜만 쓴다 — 시각을 들고 다니면 만료 비교가 타임존에 흔들린다
    expect(page.verifiedUntil).toBe("2026-12-03");
    expect(page.verifiedBy).toBe("1");
  });

  it("유효기간을 안 주면 null로 보내 서버 기본값(90일)에 맡긴다", async () => {
    const spy = mockSeq([{ status: 200, body: pageDto({ verifiedUntil: "2026-12-03T00:00:00Z" }) }]);
    const { verifyPage } = await import("./wikiApi");

    await verifyPage("7");
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({ verifiedUntil: null });
  });

  it("검증 해제는 DELETE /verification, 응답에서 필드가 비워진다", async () => {
    const spy = mockSeq([{ status: 200, body: pageDto() }]);
    const { unverifyPage } = await import("./wikiApi");

    const page = await unverifyPage("7");
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
    expect(page.verifiedUntil).toBeNull();
    expect(page.verifiedAt).toBeNull();
  });

  it("소유자·검증이 없는 구버전 응답도 읽는다", async () => {
    mockSeq([{ status: 200, body: pageDto() }]);
    const { getPage } = await import("./wikiApi");

    const page = await getPage("7");
    expect(page!.ownerId).toBeNull();
    expect(page!.verifiedUntil).toBeNull();
  });
});

describe("wikiApi 알림 타입 (W27-4)", () => {
  it("PAGE_PUBLISHED를 page_published로 읽는다", async () => {
    mockSeq([
      {
        status: 200,
        body: {
          unreadCount: 1,
          items: [
            {
              id: 1,
              type: "PAGE_PUBLISHED",
              pageId: 7,
              spaceId: 5,
              pageTitle: "새 문서",
              actorId: 2,
              createdAt: "2026-09-04T00:00:00Z",
              read: false,
            },
          ],
        },
      },
    ]);
    const { listNotifications } = await import("./wikiApi");

    const list = await listNotifications();
    expect(list.items[0].type).toBe("page_published");
  });
});
