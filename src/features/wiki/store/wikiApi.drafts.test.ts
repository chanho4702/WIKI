import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { listMyDrafts } from "./wikiApi";

afterEach(() => vi.restoreAllMocks());

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/* F-04 내 초안 — 계약 GET /api/wiki/drafts?limit= (최근 방문과 같은 행 모양) */
describe("wikiApi.listMyDrafts", () => {
  it("행을 별표·최근과 같은 모양으로 매핑한다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(200, [
      { page: { id: 7, parentId: null, title: "쓰다 만 문서", type: "page", status: "draft", position: 1 }, spaceId: 3, spaceName: "개발" },
    ]));
    expect(await listMyDrafts(10)).toEqual([
      expect.objectContaining({ id: "7", spaceId: "3", spaceName: "개발", title: "쓰다 만 문서", type: "page" }),
    ]);
    expect(spy).toHaveBeenCalledWith("/api/wiki/drafts?limit=10");
  });

  it("서버에 아직 없으면(404) null — 화면이 탭을 숨긴다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(404, { error: "찾을 수 없습니다" }));
    expect(await listMyDrafts()).toBeNull();
  });

  it("그 밖의 실패는 삼키지 않는다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(503, { error: "권한 서비스를 사용할 수 없습니다" }));
    await expect(listMyDrafts()).rejects.toThrow("권한 서비스를 사용할 수 없습니다");
  });
});
