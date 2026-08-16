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

  it("Yjs full-state를 bootstrap 전용 ticket 경계로 보내고 generation을 읽는다", async () => {
    const state = Uint8Array.from([1, 2, 3]);
    const spy = vi.spyOn(client, "sharedCollaborationFetch").mockResolvedValue(
      new Response(JSON.stringify({ created: true, basePageVersion: 4, generation: 1 }), {
        status: 201,
      }),
    );
    const { bootstrapCollaborationDocument } = await import("./wikiApi");

    await expect(bootstrapCollaborationDocument("7", 4, "one-time-ticket", state))
      .resolves.toEqual({ created: true, basePageVersion: 4, generation: 1 });
    expect(spy).toHaveBeenCalledWith(
      "/api/wiki/collaboration/pages/7/bootstrap",
      "one-time-ticket",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Wiki-Page-Version": "4",
        },
        body: state,
      }),
    );
  });

  it("bootstrap metadata가 손상됐으면 공유 편집기를 열지 않는다", async () => {
    vi.spyOn(client, "sharedCollaborationFetch").mockResolvedValue(
      new Response(JSON.stringify({ created: true, generation: 0 }), { status: 201 }),
    );
    const { bootstrapCollaborationDocument } = await import("./wikiApi");
    await expect(bootstrapCollaborationDocument("7", 4, "ticket", Uint8Array.from([1])))
      .rejects.toThrow("공동 편집 문서 정보를 확인할 수 없습니다");
  });
});
