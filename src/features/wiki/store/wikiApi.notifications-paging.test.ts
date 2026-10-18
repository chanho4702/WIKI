import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { getNotificationPrefs, listNotifications } from "./wikiApi";

afterEach(() => vi.restoreAllMocks());

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

/* F-05 계약: GET /api/wiki/notifications?before=&limit=&type= → {unreadCount, items, nextBefore} */
describe("wikiApi.listNotifications 쪽 넘김·필터", () => {
  it("before·limit·type(서버 enum, 쉼표)을 싣고 nextBefore(Long)를 문자열로 준다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(ok({ unreadCount: 4, items: [], nextBefore: 120 }));
    const page = await listNotifications({ before: "150", limit: 50, types: ["mentioned", "page_published"] });
    expect(spy.mock.calls[0][0]).toBe("/api/wiki/notifications?before=150&limit=50&type=MENTIONED%2CPAGE_PUBLISHED");
    expect(page).toMatchObject({ unreadCount: 4, nextBefore: "120" });
  });

  it("옵션이 없으면 예전 경로 그대로(벨), nextBefore가 없는 구버전 응답은 null", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(ok({ unreadCount: 0, items: [] }));
    const page = await listNotifications();
    expect(spy.mock.calls[0][0]).toBe("/api/wiki/notifications");
    expect(page.nextBefore).toBeNull();
  });

  it("알림 설정의 pagePublished가 없으면(구버전 서버) pageUpdated를 따른다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(ok({
      emailConfigured: true, email: null, emailEnabled: true, emailMode: "IMMEDIATE",
      mentioned: true, pageUpdated: false, comment: true, shared: true,
    }));
    expect((await getNotificationPrefs()).pagePublished).toBe(false);
  });
});
