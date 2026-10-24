import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { getPersonProfile, listPersonPages } from "./wikiApi";

afterEach(() => vi.restoreAllMocks());

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/* F-07 사람 프로필 — org-service `GET /api/org/members/{id}`(MemberDetailResponse) */
describe("wikiApi.getPersonProfile", () => {
  it("이름·이메일·상태·팀을 매핑하고 EVERYONE 팀은 뺀다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(200, {
      id: 42, displayName: "김찬호", email: "chanho@example.com", status: "ACTIVE", kind: "HUMAN",
      teams: [
        { teamId: 1, name: "모두", kind: "EVERYONE", role: "MEMBER" },
        { teamId: 3, name: "플랫폼팀", kind: "STANDARD", role: "LEAD" },
      ],
      grants: null,
    }));
    expect(await getPersonProfile("42")).toEqual({
      id: "42", name: "김찬호", email: "chanho@example.com", status: "ACTIVE",
      teams: [{ id: "3", name: "플랫폼팀" }],
    });
    expect(spy).toHaveBeenCalledWith("/api/org/members/42");
  });

  it("비활성 구성원도 그대로 준다(상태 판정은 화면 몫)", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(200, {
      id: 5, displayName: "", email: "gone@example.com", status: "DEACTIVATED", teams: [],
    }));
    expect(await getPersonProfile("5")).toMatchObject({ name: "gone@example.com", status: "DEACTIVATED" });
  });

  it("없는 사람(404)·숫자가 아닌 id는 null — 숫자가 아니면 부르지도 않는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(404, { error: "멤버 없음: 9" }));
    expect(await getPersonProfile("9")).toBeNull();
    expect(await getPersonProfile("u2")).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("장애는 삼키지 않는다 — 없는 사람으로 보이면 안 된다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(503, { error: "조직 서비스를 사용할 수 없습니다" }));
    await expect(getPersonProfile("1")).rejects.toThrow("조직 서비스를 사용할 수 없습니다");
  });
});

/* F-07 최근 작업한 문서 — 제안 계약 `GET /api/wiki/users/{id}/pages?limit=`(내 초안과 같은 행 모양) */
describe("wikiApi.listPersonPages", () => {
  it("행을 매핑하고 상태·수정 시각을 싣는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(200, [
      { page: { id: 7, parentId: null, title: "배포 가이드", type: "page", status: "draft", updatedAt: "2026-10-20T01:00:00Z" }, spaceId: 3, spaceName: "개발" },
      { page: { id: 8, parentId: 7, title: "옛 행" }, spaceId: 3, spaceName: null },
    ]));
    expect(await listPersonPages("42", 20)).toEqual([
      expect.objectContaining({ id: "7", spaceId: "3", spaceName: "개발", title: "배포 가이드", status: "draft", updatedAt: "2026-10-20T01:00:00Z" }),
      expect.objectContaining({ id: "8", status: "published", updatedAt: null }),
    ]);
    expect(spy).toHaveBeenCalledWith("/api/wiki/users/42/pages?limit=20");
  });

  it("서버에 아직 없으면(404) null — 화면이 '아직 제공하지 않는다'를 알린다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(404, { error: "찾을 수 없습니다" }));
    expect(await listPersonPages("42")).toBeNull();
  });

  it("그 밖의 실패는 삼키지 않는다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(503, { error: "권한 서비스를 사용할 수 없습니다" }));
    await expect(listPersonPages("42")).rejects.toThrow("권한 서비스를 사용할 수 없습니다");
  });
});
