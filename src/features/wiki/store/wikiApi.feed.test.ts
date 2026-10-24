import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { listFollowingFeed, listPopularFeed } from "./wikiApi";

afterEach(() => vi.restoreAllMocks());

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/* 홈 피드(2026-10-24) — `GET /api/wiki/feed/{popular,following}?limit=` (행 = 내 초안 행 + viewCount) */
describe("wikiApi 홈 피드", () => {
  it("인기: 행을 매핑하고 수정자·조회수를 싣는다(id는 문자열)", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(200, [
      {
        page: { id: 7, parentId: null, title: "배포 가이드", type: "page", status: "published", position: 1, icon: "🚀", updatedBy: 42, updatedAt: "2026-10-20T01:00:00Z" },
        spaceId: 3, spaceName: "개발", viewCount: 31,
      },
      { page: { id: 8, parentId: 7, title: "옛 행" }, spaceId: 3, spaceName: null },
    ]));
    expect(await listPopularFeed(8)).toEqual([
      {
        id: "7", spaceId: "3", spaceName: "개발", title: "배포 가이드", icon: "🚀", type: "page",
        status: "published", updatedAt: "2026-10-20T01:00:00Z", updatedBy: "42", viewCount: 31,
      },
      expect.objectContaining({ id: "8", updatedBy: null, updatedAt: null, viewCount: 0 }),
    ]);
    expect(spy).toHaveBeenCalledWith("/api/wiki/feed/popular?limit=8");
  });

  it("팔로잉은 자기 경로를 부른다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(200, []));
    expect(await listFollowingFeed()).toEqual([]);
    expect(spy).toHaveBeenCalledWith("/api/wiki/feed/following?limit=20");
  });

  it("경로가 아직 없는 서버(404)면 null", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(404, { error: "찾을 수 없습니다" }));
    expect(await listPopularFeed()).toBeNull();
    expect(await listFollowingFeed()).toBeNull();
  });

  it("그 밖의 실패는 삼키지 않는다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(503, { error: "권한 서비스를 사용할 수 없습니다" }));
    await expect(listPopularFeed()).rejects.toThrow("권한 서비스를 사용할 수 없습니다");
  });
});
