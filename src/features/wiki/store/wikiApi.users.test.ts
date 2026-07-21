import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

afterEach(() => vi.restoreAllMocks());

describe("wikiApi.getCurrentUser", () => {
  it("getCurrentUser는 /api/me의 id/name을 User로", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 11, name: "이서연" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const { getCurrentUser } = await import("./wikiApi");
    expect(await getCurrentUser()).toMatchObject({ id: "11", name: "이서연" });
  });

  it("name이 없으면 email로, 둘 다 없으면 `사용자 #{id}`로 폴백", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 12, email: "a@b.com" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const { getCurrentUser } = await import("./wikiApi");
    expect(await getCurrentUser()).toMatchObject({ id: "12", name: "a@b.com" });
  });
});

describe("wikiApi.listUsers", () => {
  it("listUsers는 폴백으로 빈 배열(org-service 미연동)", async () => {
    const { listUsers } = await import("./wikiApi");
    expect(await listUsers()).toEqual([]);
  });
});

describe("wikiApi.displayUserName", () => {
  it("id를 `사용자 #{id}` 형태로 표시", async () => {
    const { displayUserName } = await import("./wikiApi");
    expect(displayUserName("7")).toBe("사용자 #7");
  });
});
