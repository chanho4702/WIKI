import { afterEach, describe, expect, it, vi } from "vitest";
import { sharedAuthClient, sharedCollaborationFetch } from "./apiClient";

afterEach(() => {
  sharedAuthClient.setAccessToken(null);
  vi.unstubAllGlobals();
});

describe("sharedCollaborationFetch", () => {
  it("Access Token 대신 1회 ticket만 Authorization에 넣고 401을 재전송하지 않는다", async () => {
    sharedAuthClient.setAccessToken("must-not-leak-access-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await sharedCollaborationFetch("/api/wiki/collaboration/bootstrap", "ticket-value", {
      method: "POST",
      body: Uint8Array.from([1]) as BodyInit,
    });

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Collaboration ticket-value");
    expect(headers.get("Authorization")).not.toContain("must-not-leak-access-token");
    expect(init).toMatchObject({ credentials: "omit", cache: "no-store" });
  });
});
