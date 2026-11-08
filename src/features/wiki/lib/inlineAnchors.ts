import type { CommentAnchor } from "../store/types";

/**
 * 인라인 댓글 앵커(W21-4).
 *
 * 앵커는 **렌더된 본문의 텍스트**다. 저장 형식이 마크다운 문자열이라 안정적인 블록 id가 없고
 * (갭 분석 §4.2), 원문 오프셋으로 잡으면 서식을 가로지르는 선택(`배포는 **금요일**에`)을
 * 표현할 수 없다. 그래서 "이 텍스트의 n번째 등장"으로 잡고, 본문이 바뀌어 못 찾으면 스레드를
 * 지우지 않고 "위치 없음"으로 남긴다 — 편집 한 번에 대화가 사라지면 안 된다.
 */

/** 사용자가 선택할 수 있는 최대 길이 — 문단을 통째로 앵커로 잡으면 하이라이트가 의미를 잃는다. */
export const MAX_QUOTE_LENGTH = 300;

/**
 * 앵커 텍스트에서 빠지는 영역의 표시. **나중에 붙는 장식**(ALM 스마트 링크의 제목·상태처럼 조회가
 * 끝나야 생기는 글자)에 단다 — 그 글자가 앵커 텍스트에 섞이면 조회 전후로 텍스트가 달라져
 * 링크를 가로지르는 인용이 "위치 없음"이 되거나 등장 순번이 밀린다(W3 리뷰 I1).
 */
export const ANCHOR_IGNORE_ATTR = "data-anchor-ignore";

function textNodesOf(container: HTMLElement): Text[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element).hasAttribute(ANCHOR_IGNORE_ATTR)
          ? NodeFilter.FILTER_REJECT // 하위 전체를 건너뛴다
          : NodeFilter.FILTER_SKIP // 요소 자체는 세지 않고 자식으로 내려간다
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

/** 텍스트 노드를 이어붙인 문자열과, 각 노드가 시작하는 절대 오프셋. */
function flatten(container: HTMLElement): { text: string; nodes: Text[]; starts: number[] } {
  const nodes = textNodesOf(container);
  const starts: number[] = [];
  let text = "";
  for (const node of nodes) {
    starts.push(text.length);
    text += node.data;
  }
  return { text, nodes, starts };
}

/** quote가 occurrence번째(0부터)로 등장하는 절대 오프셋. 없으면 -1. */
export function offsetOfOccurrence(text: string, quote: string, occurrence: number): number {
  let from = 0;
  for (let i = 0; i <= occurrence; i++) {
    const at = text.indexOf(quote, from);
    if (at < 0) return -1;
    if (i === occurrence) return at;
    from = at + 1;
  }
  return -1;
}

/**
 * 현재 선택 영역을 앵커로 바꾼다. 선택이 없거나 컨테이너 밖이면 null.
 * occurrence는 "선택 지점 앞에 같은 텍스트가 몇 번 나왔는가"로 센다.
 */
export function anchorFromSelection(container: HTMLElement): CommentAnchor | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const quote = selection.toString().trim();
  if (!quote || quote.length > MAX_QUOTE_LENGTH) return null;

  const flat = flatten(container);
  const { text } = flat;
  const ignored = Array.from(container.querySelectorAll(`[${ANCHOR_IGNORE_ATTR}]`));
  if (ignored.some((el) => range.intersectsNode(el))) {
    // 선택이 앵커 밖 영역(스마트 링크 제목 등)에 걸쳤다 — 선택 문자열에는 그 글자가 있지만 앵커
    // 텍스트에는 없으니, 앵커 텍스트 좌표로 잘라 인용을 다시 만든다.
    const start = absoluteOffset(flat, range.startContainer, range.startOffset);
    const end = absoluteOffset(flat, range.endContainer, range.endOffset);
    const raw = text.slice(start, end);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > MAX_QUOTE_LENGTH) return null;
    const from = start + (raw.length - raw.trimStart().length);
    return { quote: trimmed, occurrence: occurrenceBefore(text, trimmed, from) };
  }
  const nodeIndex = flat.nodes.indexOf(range.startContainer as Text);
  const absolute = nodeIndex < 0 ? text.indexOf(quote) : flat.starts[nodeIndex] + range.startOffset;
  if (absolute < 0) return null;

  return { quote, occurrence: occurrenceBefore(text, quote, absolute) };
}

/** 선택 시작 지점보다 앞에 있는 같은 텍스트의 개수 = 이 선택의 등장 순번. */
function occurrenceBefore(text: string, quote: string, absolute: number): number {
  let occurrence = 0;
  let cursor = text.indexOf(quote);
  while (cursor >= 0 && cursor < absolute) {
    occurrence += 1;
    cursor = text.indexOf(quote, cursor + 1);
  }
  return occurrence;
}

/**
 * DOM 경계 지점(node, offset) → 앵커 텍스트의 절대 오프셋. 앵커에 들어가는 텍스트 노드 안이면 그대로,
 * 아니면(앵커 밖 영역 안·요소 경계) 그 지점 **뒤에 오는** 첫 앵커 텍스트 노드의 시작으로 접는다.
 */
function absoluteOffset(flat: { text: string; nodes: Text[]; starts: number[] }, node: Node, offset: number): number {
  const index = flat.nodes.indexOf(node as Text);
  if (index >= 0) return flat.starts[index] + offset;
  const point = document.createRange();
  point.setStart(node, offset);
  point.collapse(true);
  for (let i = 0; i < flat.nodes.length; i++) {
    if (point.comparePoint(flat.nodes[i], 0) >= 0) return flat.starts[i];
  }
  return flat.text.length;
}

export interface HighlightTarget {
  id: string;
  quote: string;
  occurrence: number;
  /** 답글 수 — 하이라이트 끝의 말풍선에 그린다. 본문에는 "댓글이 있다"만 보인다. */
  replyCount: number;
}

/**
 * 앵커 구간을 `<mark>`로 감싼다. 이전 하이라이트는 먼저 걷어낸다.
 * 반환값은 실제로 찾아 표시한 id들 — 나머지는 화면이 "위치 없음"으로 표시한다.
 */
export function applyHighlights(container: HTMLElement, targets: HighlightTarget[]): Set<string> {
  clearHighlights(container);
  const found = new Set<string>();
  for (const target of targets) {
    // 매번 다시 편다 — 앞선 하이라이트가 텍스트 노드를 쪼개 오프셋이 달라진다.
    const { text, nodes, starts } = flatten(container);
    const at = offsetOfOccurrence(text, target.quote, target.occurrence);
    if (at < 0) continue;
    if (wrapRange(nodes, starts, at, target.quote.length, target)) found.add(target.id);
  }
  return found;
}

export function clearHighlights(container: HTMLElement): void {
  for (const mark of Array.from(container.querySelectorAll("mark[data-comment-id]"))) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
}

/**
 * [at, at+length) 구간과 겹치는 텍스트 노드 조각을 각각 mark로 감싼다.
 *
 * 구간이 서식을 가로지르면(`배포는 **금요일**에`) mark가 여러 개로 쪼개진다 — 말풍선 표시는
 * 마지막 조각에만 붙여야 한 구간에 말풍선이 여러 개 뜨지 않는다.
 */
function wrapRange(
  nodes: Text[],
  starts: number[],
  at: number,
  length: number,
  target: HighlightTarget,
): boolean {
  const end = at + length;
  let wrapped = false;
  let last: HTMLElement | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nodeStart = starts[i];
    const nodeEnd = nodeStart + node.data.length;
    if (nodeEnd <= at || nodeStart >= end) continue;

    const from = Math.max(at - nodeStart, 0);
    const to = Math.min(end - nodeStart, node.data.length);
    if (from >= to) continue;

    // 겹치는 부분만 남기고 앞뒤를 떼어낸다 — split은 뒤쪽을 새 노드로 만든다.
    const middle = from > 0 ? node.splitText(from) : node;
    if (to - from < middle.data.length) middle.splitText(to - from);

    const mark = document.createElement("mark");
    mark.dataset.commentId = target.id;
    mark.className = "inline-comment-highlight";
    // 하이라이트 자체가 "여기를 누르면 대화가 열린다"는 유일한 신호다 — 키보드로도 닿아야 한다.
    mark.tabIndex = 0;
    mark.setAttribute("role", "button");
    mark.setAttribute("aria-label", `본문 댓글 보기: ${target.quote}`);
    middle.parentNode?.insertBefore(mark, middle);
    mark.appendChild(middle);
    last = mark;
    wrapped = true;
  }
  if (last) {
    last.dataset.commentLast = "true";
    last.dataset.commentCount = String(target.replyCount + 1);
  }
  return wrapped;
}
