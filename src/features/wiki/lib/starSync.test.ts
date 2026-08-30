import { beforeEach, describe, expect, it, vi } from "vitest";

const listStars = vi.fn();
const setPageStar = vi.fn((_id: string, _starred: boolean) => Promise.resolve());
const setSpaceStar = vi.fn((_id: string, _starred: boolean) => Promise.resolve());

vi.mock("../store/wikiStore", () => ({
  listStars: () => listStars(),
  setPageStar: (id: string, starred: boolean) => setPageStar(id, starred),
  setSpaceStar: (id: string, starred: boolean) => setSpaceStar(id, starred),
}));

const PAGES_KEY = "wiki.ui.starredPages";
const SPACES_KEY = "wiki.ui.starredSpaces";
const MIGRATED_KEY = "wiki.ui.starsMigrated";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

async function sync() {
  const { syncStarsFromServer } = await import("./starSync");
  await syncStarsFromServer();
}

/**
 * 별표의 서버 이전(W23).
 *
 * 브라우저 사본을 계속 두는 이유는 첫 렌더에 네트워크를 기다리지 않기 위해서다. 그래서 이
 * 모듈의 위험은 하나로 모인다 — **언제 사본을 덮어써도 되는가.** 잘못 덮으면 사용자가 모아 둔
 * 별표가 조용히 사라진다.
 */
describe("별표 서버 동기화", () => {
  it("서버 원장을 사본에 반영한다", async () => {
    listStars.mockResolvedValue({
      spaceIds: ["sp1"],
      pages: [
        { id: "pg1", spaceId: "sp1", spaceName: "개발", title: "시작하기", icon: null, type: "page" },
      ],
    });

    await sync();

    expect(JSON.parse(localStorage.getItem(SPACES_KEY) ?? "[]")).toEqual(["sp1"]);
    expect(JSON.parse(localStorage.getItem(PAGES_KEY) ?? "[]")).toEqual([
      { id: "pg1", spaceId: "sp1", title: "시작하기", icon: null, type: "page" },
    ]);
  });

  /** null = "이 모드에는 서버 원장이 없다". 빈 목록으로 덮으면 목업에서 별표가 날아간다. */
  it("서버 원장이 없으면(null) 사본을 건드리지 않는다", async () => {
    localStorage.setItem(SPACES_KEY, JSON.stringify(["sp2"]));
    listStars.mockResolvedValue(null);

    await sync();

    expect(JSON.parse(localStorage.getItem(SPACES_KEY) ?? "[]")).toEqual(["sp2"]);
    expect(setSpaceStar).not.toHaveBeenCalled();
  });

  it("서버를 못 읽으면 사본을 그대로 두고 조용히 끝난다", async () => {
    localStorage.setItem(SPACES_KEY, JSON.stringify(["sp2"]));
    listStars.mockRejectedValue(new Error("network"));

    await sync();

    expect(JSON.parse(localStorage.getItem(SPACES_KEY) ?? "[]")).toEqual(["sp2"]);
  });

  /** 이 기능이 생기기 전에 브라우저에만 모아 둔 별표를 잃지 않아야 한다. */
  it("서버가 비었고 사본에만 있으면 한 번 올려 보낸다", async () => {
    localStorage.setItem(SPACES_KEY, JSON.stringify(["sp1"]));
    localStorage.setItem(
      PAGES_KEY,
      JSON.stringify([{ id: "pg1", spaceId: "sp1", title: "시작하기" }]),
    );
    listStars.mockResolvedValue({ spaceIds: [], pages: [] });

    await sync();

    expect(setSpaceStar).toHaveBeenCalledWith("sp1", true);
    expect(setPageStar).toHaveBeenCalledWith("pg1", true);
    // 사본이 이미 정답이라 덮어쓰지 않는다
    expect(JSON.parse(localStorage.getItem(SPACES_KEY) ?? "[]")).toEqual(["sp1"]);
    expect(localStorage.getItem(MIGRATED_KEY)).toBe("1");
  });

  /** 사용자가 스스로 전부 지웠는데 다음 실행에서 되살아나면 안 된다. */
  it("이관을 마쳤으면 다시 올려 보내지 않는다", async () => {
    localStorage.setItem(MIGRATED_KEY, "1");
    localStorage.setItem(SPACES_KEY, JSON.stringify(["sp1"]));
    listStars.mockResolvedValue({ spaceIds: [], pages: [] });

    await sync();

    expect(setSpaceStar).not.toHaveBeenCalled();
    // 서버가 원장이므로 빈 목록으로 덮인다 — 사용자가 지운 결과가 유지된다
    expect(localStorage.getItem(SPACES_KEY)).toBeNull();
  });

  it("서버에 이미 있으면 사본을 올려 보내지 않고 덮는다", async () => {
    localStorage.setItem(SPACES_KEY, JSON.stringify(["sp-local"]));
    listStars.mockResolvedValue({ spaceIds: ["sp-server"], pages: [] });

    await sync();

    expect(setSpaceStar).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(SPACES_KEY) ?? "[]")).toEqual(["sp-server"]);
  });
});
