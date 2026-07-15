import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, createPage, createSpace, getPage, listPages, listVersions, movePage } from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** spaceId의 페이지 중 parentId가 일치하는 것을 position 순으로 반환 */
async function siblings(spaceId: string, parentId: string | null) {
  return (await listPages(spaceId)).filter((p) => p.parentId === parentId);
}

describe("movePage", () => {
  it("같은 부모 안에서 beforeId 앞으로 이동하고 position을 1..n으로 재부여한다", async () => {
    await movePage("pg2", { parentId: null, beforeId: "pg1" });
    const roots = await siblings("sp1", null);
    expect(roots.map((p) => p.id)).toEqual(["pg2", "pg1"]);
    expect(roots.map((p) => p.position)).toEqual([1, 2]);
  });

  it("beforeId 없으면 새 부모의 맨 뒤로 이동한다", async () => {
    await movePage("pg3", { parentId: null }); // pg1 하위 → 루트 맨 뒤
    const roots = await siblings("sp1", null);
    expect(roots.map((p) => p.id)).toEqual(["pg1", "pg2", "pg3"]);
    const moved = await getPage("pg3");
    expect(moved?.parentId).toBeNull();
    // 원래 형제(pg4)의 상대 순서는 유지된다
    expect((await siblings("sp1", "pg1")).map((p) => p.id)).toEqual(["pg4"]);
  });

  it("자기 자신을 부모로 지정하면 거부한다", async () => {
    await expect(movePage("pg1", { parentId: "pg1" })).rejects.toThrow(
      "페이지를 자신의 하위로 이동할 수 없습니다",
    );
  });

  it("자기 자손(손자) 밑으로 이동하면 거부한다", async () => {
    await expect(movePage("pg1", { parentId: "pg5" })).rejects.toThrow(
      "페이지를 자신의 하위로 이동할 수 없습니다",
    );
  });

  it("다른 스페이스의 페이지를 부모로 지정하면 거부한다", async () => {
    const other = await createSpace({ key: "OPS", name: "운영" });
    const otherRoot = await createPage({ spaceId: other.id, title: "운영 홈" });
    await expect(movePage("pg1", { parentId: otherRoot.id })).rejects.toThrow(
      "부모 페이지가 같은 스페이스에 없습니다",
    );
  });

  it("beforeId가 대상 부모의 자식이 아니면 거부한다", async () => {
    // pg3은 루트가 아니라 pg1의 자식이다
    await expect(movePage("pg2", { parentId: null, beforeId: "pg3" })).rejects.toThrow(
      "기준 페이지가 대상 위치에 없습니다",
    );
  });

  it("없는 페이지는 거부한다", async () => {
    await expect(movePage("없는id", { parentId: null })).rejects.toThrow(
      "페이지를 찾을 수 없습니다",
    );
  });

  it("이동은 버전을 만들지 않고 updatedAt도 바꾸지 않는다", async () => {
    const before = await getPage("pg3");
    await movePage("pg3", { parentId: "pg2" });
    const after = await getPage("pg3");
    expect(after?.updatedAt).toBe(before?.updatedAt);
    expect(await listVersions("pg3")).toHaveLength(1); // 시드 v1 그대로
  });
});
