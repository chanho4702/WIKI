import { describe, expect, it } from "vitest";
import { projectDrop, type FlatDropNode } from "./pageTreeDnd";

// 시드 트리의 평탄화: pg1(루트) > pg3 > pg5, pg1 > pg4, pg2(루트)
const NODES: FlatDropNode[] = [
  { id: "pg1", parentId: null, depth: 0 },
  { id: "pg3", parentId: "pg1", depth: 1 },
  { id: "pg5", parentId: "pg3", depth: 2 },
  { id: "pg4", parentId: "pg1", depth: 1 },
  { id: "pg2", parentId: null, depth: 0 },
];
const INDENT = 24;

describe("projectDrop", () => {
  it("루트 맨 앞으로 끌면 첫 루트 앞에 삽입한다", () => {
    expect(projectDrop(NODES, "pg2", "pg1", 0, INDENT)).toEqual({
      parentId: null,
      beforeId: "pg1",
    });
  });

  it("제자리에서 오른쪽으로 한 칸 들여쓰면 앞 항목의 부모를 따라간다", () => {
    // pg2(depth 0)를 +24px → depth 1 → 앞 항목 pg4(depth 1)와 형제 = pg1의 자식 맨 뒤
    expect(projectDrop(NODES, "pg2", "pg2", INDENT, INDENT)).toEqual({
      parentId: "pg1",
      beforeId: null,
    });
  });

  it("왼쪽으로 빼도 다음 항목의 깊이 아래로는 내려가지 않는다", () => {
    // pg5(depth 2)를 -48px → 목표 0이지만 다음 항목 pg4(depth 1)가 하한 → depth 1
    expect(projectDrop(NODES, "pg5", "pg5", -2 * INDENT, INDENT)).toEqual({
      parentId: "pg1",
      beforeId: "pg4",
    });
  });

  it("자손이 제외된 목록에서 부모를 맨 아래로 내리면 루트 맨 뒤가 된다", () => {
    // pg1 드래그 중에는 자손(pg3/pg5/pg4)이 목록에서 빠진다
    const during: FlatDropNode[] = [
      { id: "pg1", parentId: null, depth: 0 },
      { id: "pg2", parentId: null, depth: 0 },
    ];
    expect(projectDrop(during, "pg1", "pg2", 0, INDENT)).toEqual({
      parentId: null,
      beforeId: null,
    });
  });

  it("모르는 id면 null을 반환한다", () => {
    expect(projectDrop(NODES, "없는id", "pg1", 0, INDENT)).toBeNull();
  });
});
