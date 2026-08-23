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
  it("org 디렉터리(/api/org/members)에서 ACTIVE만 User로 매핑", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: 1, displayName: "이서연", email: "a@b.com", status: "ACTIVE" },
          { id: 2, displayName: "탈퇴자", email: null, status: "INACTIVE" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const { listUsers } = await import("./wikiApi");
    expect(await listUsers()).toEqual([{ id: "1", name: "이서연" }]);
    expect(spy).toHaveBeenCalledWith("/api/org/members");
  });

  it("디렉터리 장애는 화면을 죽이지 않고 빈 목록으로 폴백", async () => {
    vi.spyOn(client, "sharedApiFetch").mockRejectedValueOnce(new Error("network down"));
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
