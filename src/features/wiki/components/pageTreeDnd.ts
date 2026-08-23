export interface FlatDropNode {
  id: string;
  parentId: string | null;
  depth: number;
}

/**
 * 드롭 의도 — 항목 위 어느 세로 지점에 놓았는가로 정한다(Notion/Confluence 트리 관례).
 *
 * - 상단 25%: 그 항목 **앞**(형제)
 * - 하단 25%: 그 항목 **뒤**(형제)
 * - 가운데 50%: 그 항목의 **하위**로
 *
 * 예전 방식(수평 오프셋 24px 들여쓰기 투영)은 "오른쪽으로 끌면 하위"라는 규칙을 아는
 * 사람에게만 보였다 — 가운데 드롭은 손이 자연히 가는 동작이라 발견 가능성이 다르다.
 */
export type DropMode = "before" | "after" | "child";

export function dropModeFor(pointerY: number, overTop: number, overHeight: number): DropMode {
  const ratio = (pointerY - overTop) / Math.max(overHeight, 1);
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "child";
}

/** activeId의 자손 집합 — 자기 자손 아래로의 드롭은 순환이라 금지한다(서버 가드의 프리체크). */
export function descendantIdsOf(nodes: FlatDropNode[], activeId: string): Set<string> {
  const childrenOf = new Map<string | null, FlatDropNode[]>();
  for (const node of nodes) {
    const list = childrenOf.get(node.parentId) ?? [];
    list.push(node);
    childrenOf.set(node.parentId, list);
  }
  const out = new Set<string>();
  const queue = [activeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of childrenOf.get(id) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return out;
}

/**
 * 드롭 의도 → movePage 인자. 유효하지 않은 드롭(자기 자신·자기 자손)은 null.
 * before/after의 beforeId는 목업 모드의 형제 순서용이다 — 백엔드는 아직 순서를 저장하지
 * 않으므로(P1-001) parentId만 반영된다.
 */
export function resolveDrop(
  nodes: FlatDropNode[],
  activeId: string,
  overId: string,
  mode: DropMode,
): { parentId: string | null; beforeId: string | null } | null {
  if (activeId === overId) return null;
  const over = nodes.find((n) => n.id === overId);
  if (!over) return null;
  if (descendantIdsOf(nodes, activeId).has(overId)) return null;

  if (mode === "child") {
    return { parentId: over.id, beforeId: null };
  }
  if (mode === "before") {
    return { parentId: over.parentId, beforeId: over.id };
  }
  // after: over 다음의 같은 부모 형제 앞에 놓는다. 없으면 맨 뒤(null).
  const overIndex = nodes.findIndex((n) => n.id === overId);
  for (let i = overIndex + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.parentId === over.parentId) {
      return { parentId: over.parentId, beforeId: node.id === activeId ? null : node.id };
    }
    if (node.depth < over.depth) break; // over의 부모 범위를 벗어났다
  }
  return { parentId: over.parentId, beforeId: null };
}
