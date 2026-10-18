import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { __resetUserDirectoryForTest, listSelectableUsers, listTeams, listUsers } from "./wikiApi";

/*
 * W-12 — 조직 멤버 전량(`/api/org/members`)을 화면마다 캐시 없이 받던 것. 문서 하나를 열면 보기 화면·알림 벨 등이
 * 같은 전량 응답을 두세 번 받았다. 스토어가 진행 중 요청을 합치고 TTL 동안 재사용한다.
 * W-18 — 디렉터리 장애(503)를 빈 목록으로 삼켜 선택 UI(제한 다이얼로그)가 "팀 없음"으로 보이던 것.
 */

const ok = (rows: unknown) =>
  new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
const unavailable = () =>
  new Response(JSON.stringify({ error: "조직 서비스를 사용할 수 없습니다" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
const MEMBERS = [{ id: 1, displayName: "이서연", email: "a@b.com", status: "ACTIVE" }];

beforeEach(() => __resetUserDirectoryForTest());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("사용자 디렉터리 공유 캐시(W-12)", () => {
  it("동시에 여러 화면이 불러도 요청은 한 번이고, TTL 안의 다음 호출도 재사용한다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockImplementation(async () => ok(MEMBERS));
    const [a, b, c] = await Promise.all([listUsers(), listUsers(), listSelectableUsers()]);
    expect(a).toEqual([{ id: "1", name: "이서연" }]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    await listUsers();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("호출자에게 주는 배열은 서로 독립이다 — 한 화면이 고쳐도 캐시가 오염되지 않는다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockImplementation(async () => ok(MEMBERS));
    const first = await listUsers();
    first[0].name = "변경";
    first.push({ id: "9", name: "추가" });
    expect(await listUsers()).toEqual([{ id: "1", name: "이서연" }]);
  });

  it("TTL(5분)이 지나면 다시 받는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const spy = vi.spyOn(client, "sharedApiFetch").mockImplementation(async () => ok(MEMBERS));
    await listUsers();
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
    await listUsers();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("실패는 캐시하지 않는다 — 장애가 풀리면 다음 호출이 바로 성공한다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(unavailable())
      .mockResolvedValueOnce(ok(MEMBERS));
    expect(await listUsers()).toEqual([]);
    expect(await listUsers()).toEqual([{ id: "1", name: "이서연" }]);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("디렉터리 장애 전파(W-18)", () => {
  it("listUsers는 이름 표시용이라 여전히 빈 목록으로 접지만, listSelectableUsers는 사유를 던진다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockImplementation(async () => unavailable());
    expect(await listUsers()).toEqual([]);
    await expect(listSelectableUsers()).rejects.toThrow("조직 서비스를 사용할 수 없습니다");
  });

  it("listTeams는 선택 UI 전용이라 503을 빈 목록으로 삼키지 않는다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockImplementation(async () => unavailable());
    await expect(listTeams()).rejects.toThrow("조직 서비스를 사용할 수 없습니다");
  });
});
