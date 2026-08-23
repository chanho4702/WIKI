/**
 * `:::` 컨테이너 확장 문법의 마커 길이 계산 — 컬럼·토글이 공유한다.
 *
 * 중첩 규칙은 markdown-it-container·remark-directive 공통 관례인 **"바깥 마커가 안쪽보다
 * 길다"**이다. 예전 컬럼 직렬화는 `::::columns`/`:::column` 고정이라 컨테이너끼리 중첩하면
 * (토글 안 컬럼, 컬럼 안 토글) 안쪽 닫는 줄이 바깥을 먼저 닫아 문서가 깨졌다. 그래서
 * 마커 길이를 "자기 안에 있는 컨테이너 층수"로 계산한다:
 *
 * - 안에 컨테이너가 없으면 3 (`:::`)
 * - 컬럼(`column`)을 품은 컬럼 묶음(`columns`)은 4 (`::::`) — 기존 문서와 동일
 * - 컬럼 묶음을 품은 토글은 5 (`:::::details`)
 *
 * 길이가 3 이상이기만 하면 파서(양쪽 경로 모두 `:{3,}`)는 그대로 읽으므로, 중첩이 없는
 * 기존 문서의 직렬화 결과는 바뀌지 않는다.
 */

/** 컨테이너 확장 문법을 쓰는 노드 이름 — 새 컨테이너 블록을 추가하면 여기에도 등록한다. */
const CONTAINER_NODE_NAMES = new Set(["columnBlock", "column", "detailsBlock"]);

interface NodeLike {
  type: { name: string };
  forEach: (fn: (child: NodeLike, offset: number, index: number) => void) => void;
}

/** node "안"에 있는 컨테이너 층수(자기 자신 제외). 컨테이너가 없으면 0. */
export function containerHeightInside(node: NodeLike): number {
  let max = 0;
  node.forEach((child) => {
    const childHeight = CONTAINER_NODE_NAMES.has(child.type.name)
      ? 1 + containerHeightInside(child)
      : containerHeightInside(child);
    if (childHeight > max) max = childHeight;
  });
  return max;
}

/** 이 컨테이너 노드가 써야 할 여는/닫는 마커 문자열. */
export function containerMarker(node: NodeLike): string {
  return ":".repeat(3 + containerHeightInside(node));
}
