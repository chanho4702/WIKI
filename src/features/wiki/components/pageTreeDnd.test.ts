import { describe, expect, it } from "vitest";
import { descendantIdsOf, dropModeFor, resolveDrop, type FlatDropNode } from "./pageTreeDnd";

/**
 * 트리 드롭 규칙 — 세로 위치 기반 의도(앞/뒤/하위)로 이동을 계산한다.
 * 예전 수평 오프셋 투영(projectDrop)을 대체한 계약이므로 여기서 전부 다시 고정한다.
 */

// A(루트) ─ B(그 하위) ─ C(그 하위), D(루트)
const NODES: FlatDropNode[] = [
  { id: "A", parentId: null, depth: 0 },
  { id: "B", parentId: "A", depth: 1 },
  { id: "C", parentId: "B", depth: 2 },
  { id: "D", parentId: null, depth: 0 },
];

describe("dropModeFor — 세로 위치 → 의도", () => {
  it("상단 25%는 before, 하단 25%는 after, 가운데는 child", () => {
    expect(dropModeFor(102, 100, 32)).toBe("before"); // 2/32 = 6%
    expect(dropModeFor(116, 100, 32)).toBe("child"); // 50%
    expect(dropModeFor(130, 100, 32)).toBe("after"); // 94%
  });
});

describe("descendantIdsOf", () => {
  it("자손 전체를 계산한다", () => {
    expect(descendantIdsOf(NODES, "A")).toEqual(new Set(["B", "C"]));
    expect(descendantIdsOf(NODES, "D")).toEqual(new Set());
  });
});

describe("resolveDrop", () => {
  it("child 드롭은 대상의 하위가 된다", () => {
    expect(resolveDrop(NODES, "D", "B", "child")).toEqual({ parentId: "B", beforeId: null });
  });

  it("before 드롭은 대상의 형제로 그 앞에 놓인다", () => {
    expect(resolveDrop(NODES, "D", "B", "before")).toEqual({ parentId: "A", beforeId: "B" });
  });

  it("after 드롭은 다음 형제 앞(없으면 맨 뒤)에 놓인다", () => {
    // A 뒤 = 루트에서 D 앞
    expect(resolveDrop(NODES, "C", "A", "after")).toEqual({ parentId: null, beforeId: "D" });
    // D 뒤 = 루트 맨 뒤
    expect(resolveDrop(NODES, "B", "D", "after")).toEqual({ parentId: null, beforeId: null });
  });

  it("자기 자신·자기 자손 위 드롭은 무효다(순환 방지)", () => {
    expect(resolveDrop(NODES, "A", "A", "child")).toBeNull();
    expect(resolveDrop(NODES, "A", "C", "child")).toBeNull();
    expect(resolveDrop(NODES, "A", "B", "before")).toBeNull();
  });

  it("after의 다음 형제가 드래그 중인 자신이면 맨 뒤 취급한다", () => {
    // B 뒤에 C가 아닌, 루트 기준: A 뒤의 다음 루트 형제가 D인데 D 자신을 끌 때
    expect(resolveDrop(NODES, "D", "A", "after")).toEqual({ parentId: null, beforeId: null });
  });
});
