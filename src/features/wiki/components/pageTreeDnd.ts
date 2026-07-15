export interface FlatDropNode {
  id: string;
  parentId: string | null;
  depth: number;
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * 드롭 위치 투영 — dnd-kit tree 예제의 getProjection 단순화판.
 * 수평 오프셋을 들여쓰기 깊이로 환산하고, 앞뒤 항목의 깊이로 클램프한 뒤
 * movePage에 넘길 { parentId, beforeId }를 계산한다.
 */
export function projectDrop(
  nodes: FlatDropNode[],
  activeId: string,
  overId: string,
  offsetX: number,
  indent: number,
): { parentId: string | null; beforeId: string | null } | null {
  const activeIndex = nodes.findIndex((n) => n.id === activeId);
  const overIndex = nodes.findIndex((n) => n.id === overId);
  if (activeIndex === -1 || overIndex === -1) return null;
  const active = nodes[activeIndex];
  const sorted = arrayMove(nodes, activeIndex, overIndex); // active가 overIndex에 위치
  const previous: FlatDropNode | undefined = sorted[overIndex - 1];
  const next: FlatDropNode | undefined = sorted[overIndex + 1];

  const projected = active.depth + Math.round(offsetX / indent);
  const maxDepth = previous ? previous.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.min(Math.max(projected, minDepth), maxDepth);

  // 새 부모: 바로 앞 항목 기준 — 같은 깊이면 형제(부모 공유), 한 단계 얕으면 그 항목이 부모
  let parentId: string | null = null;
  if (depth > 0 && previous) {
    if (previous.depth === depth) {
      parentId = previous.parentId;
    } else if (previous.depth === depth - 1) {
      parentId = previous.id;
    } else {
      // previous가 더 깊다 — 위로 스캔해 같은 깊이의 형제를 찾는다
      for (let i = overIndex - 1; i >= 0; i--) {
        const node = sorted[i];
        if (node.depth === depth) {
          parentId = node.parentId;
          break;
        }
        if (node.depth === depth - 1) {
          parentId = node.id;
          break;
        }
      }
    }
  }

  // beforeId: 삽입 위치 뒤에서 같은 부모를 가진 첫 항목
  let beforeId: string | null = null;
  for (let i = overIndex + 1; i < sorted.length; i++) {
    const node = sorted[i];
    if (node.depth < depth) break; // 부모 범위를 벗어났다
    if (node.depth === depth && node.parentId === parentId) {
      beforeId = node.id;
      break;
    }
  }

  return { parentId, beforeId };
}
