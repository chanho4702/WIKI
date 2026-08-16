import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

afterEach(() => vi.restoreAllMocks());

describe("wikiApi collaboration ticket", () => {
  it("Access Token REST 경계에서 no-store POST로 1회용 ticket을 발급받는다", async () => {
    const body = {
      ticket: "opaque-ticket",
      room: "page:7",
      websocketPath: "/api/wiki/collaboration",
      expiresAt: "2026-08-16T10:00:00Z",
    };
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: 201 }),
    );
    const { requestCollaborationTicket } = await import("./wikiApi");

    await expect(requestCollaborationTicket("7")).resolves.toEqual(body);
    expect(spy).toHaveBeenCalledWith(
      "/api/wiki/pages/7/collaboration-ticket",
      { method: "POST", cache: "no-store" },
    );
  });

  it("필수 필드가 빠진 응답은 raw 값을 노출하지 않는 사용자 오류로 거부한다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
      new Response(JSON.stringify({ ticket: "secret" }), { status: 201 }),
    );
    const { requestCollaborationTicket } = await import("./wikiApi");
    await expect(requestCollaborationTicket("7")).rejects.toThrow(
      "공동 편집 연결 정보를 확인할 수 없습니다",
    );
  });
});
