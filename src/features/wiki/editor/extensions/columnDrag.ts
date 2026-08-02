import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import {
  COLUMN_BLOCK_NAME,
  COLUMN_NAME,
  MAX_COLUMN_COUNT,
  clampColumnCount,
} from "./columns";

/**
 * 열 레이아웃의 드래그 상호작용 3종.
 *
 * 1. **너비 조절** — 열 사이 핸들을 끌면 양옆 두 열의 너비가 바뀐다(문서에 `{width=N}`으로 저장).
 * 2. **열 재배치** — 열 상단 그립을 끌어 열 순서를 바꾼다.
 * 3. **끌어서 분할** — 블록을 다른 블록의 좌/우 가장자리에 떨구면 그 둘로 2열이 만들어진다.
 *
 * 1·2는 **포인터 이벤트**로 구현한다. HTML5 드래그(dataTransfer)를 쓰면 ProseMirror 자신의
 * 드래그 처리와 섞여 무엇이 드롭됐는지 판정이 갈린다 — GlobalDragHandle이 이미 그 경로를
 * 쓰고 있어서, 열 조작까지 같은 경로에 얹으면 서로의 드롭을 가로챈다.
 * 3만 ProseMirror의 드롭(`handleDrop`)에 붙는다 — 드래그 주체가 PM이 옮기는 블록이기 때문이다.
 */

export const columnDragPluginKey = new PluginKey("columnDrag");

/** 열이 이 % 아래로는 줄어들지 않는다 — 0%까지 끌어 열을 사라지게 만들지 않으려는 것. */
const MIN_WIDTH_PERCENT = 8;
/** 블록 좌/우 이 비율 안쪽에 떨구면 "옆에 두기"로 본다. */
const EDGE_RATIO = 0.25;

interface DragState {
  /** 진행 중인 조작 — null이면 없음 */
  kind: "resize" | "reorder" | null;
}

/** DOM 요소를 감싸는 가장 가까운 열/레이아웃의 문서 위치를 찾는다. */
function findAncestor(
  view: EditorView,
  dom: HTMLElement,
  typeName: string,
): { pos: number; node: ProseMirrorNode } | null {
  const posAt = view.posAtDOM(dom, 0);
  if (posAt < 0) return null;
  const $pos = view.state.doc.resolve(Math.min(posAt, view.state.doc.content.size));
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === typeName) return { pos: $pos.before(depth), node };
  }
  return null;
}

/** 현재 열 너비(%) — 지정값이 없으면 실제 렌더 폭에서 읽어 초기값으로 삼는다. */
function currentWidths(block: ProseMirrorNode, blockDom: HTMLElement): number[] {
  const explicit: (number | null)[] = [];
  block.forEach((child) => explicit.push((child.attrs.width as number | null) ?? null));
  if (explicit.every((w) => w !== null)) return explicit as number[];

  const columnDoms = Array.from(blockDom.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.dataset.type === COLUMN_NAME,
  );
  const total = columnDoms.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);
  if (total <= 0 || columnDoms.length !== explicit.length) {
    // 렌더 전이면 균등으로 시작한다
    return explicit.map(() => 100 / explicit.length);
  }
  return columnDoms.map((el) => (el.getBoundingClientRect().width / total) * 100);
}

export const ColumnDrag = Extension.create({
  name: "columnDrag",

  addProseMirrorPlugins() {
    const dragState: DragState = { kind: null };
    /** 드롭 예고선 위치 — dragover에서 갱신하고 decorations가 그린다 */
    let dropHint: { pos: number; side: "left" | "right" } | null = null;

    return [
      new Plugin({
        key: columnDragPluginKey,

        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== COLUMN_BLOCK_NAME) return true;
              let offset = pos + 1;
              node.forEach((child, _o, index) => {
                // 열 재배치 그립 — 모든 열에 하나씩
                decorations.push(
                  Decoration.widget(
                    offset + 1,
                    () => {
                      const grip = document.createElement("div");
                      grip.className = "column-grip";
                      grip.dataset.columnIndex = String(index);
                      grip.title = "끌어서 열 순서 변경";
                      grip.setAttribute("aria-hidden", "true");
                      grip.contentEditable = "false";
                      return grip;
                    },
                    { side: -1, key: `grip-${pos}-${index}` },
                  ),
                );
                // 너비 조절 핸들 — 열과 열 사이에만(첫 열 앞에는 없다)
                if (index > 0) {
                  decorations.push(
                    Decoration.widget(
                      offset + 1,
                      () => {
                        const handle = document.createElement("div");
                        handle.className = "column-resize-handle";
                        handle.dataset.columnIndex = String(index);
                        handle.title = "끌어서 열 너비 조절";
                        handle.setAttribute("aria-hidden", "true");
                        handle.contentEditable = "false";
                        return handle;
                      },
                      { side: -1, key: `resize-${pos}-${index}` },
                    ),
                  );
                }
                offset += child.nodeSize;
              });
              return false; // 레이아웃 안의 중첩 레이아웃은 다루지 않는다
            });

            if (dropHint) {
              decorations.push(
                Decoration.node(dropHint.pos, dropHint.pos + (state.doc.nodeAt(dropHint.pos)?.nodeSize ?? 1), {
                  class: `column-drop-target column-drop-target--${dropHint.side}`,
                }),
              );
            }
            return DecorationSet.create(state.doc, decorations);
          },

          handleDOMEvents: {
            pointerdown(view, event) {
              const target = event.target as HTMLElement | null;
              if (!target) return false;

              const handle = target.closest<HTMLElement>(".column-resize-handle");
              if (handle) {
                startResize(view, event, handle, dragState);
                return true;
              }
              const grip = target.closest<HTMLElement>(".column-grip");
              if (grip) {
                startReorder(view, grip, dragState);
                return true;
              }
              return false;
            },

            dragover(view, event) {
              const hint = computeDropHint(view, event);
              const changed =
                (hint === null) !== (dropHint === null) ||
                (hint && dropHint && (hint.pos !== dropHint.pos || hint.side !== dropHint.side));
              dropHint = hint;
              if (changed) {
                // 데코레이션만 다시 그리게 하는 빈 트랜잭션
                view.dispatch(view.state.tr.setMeta(columnDragPluginKey, { hint }));
              }
              return false;
            },

            dragleave() {
              dropHint = null;
              return false;
            },
          },

          handleDrop(view, event, slice, moved) {
            const hint = computeDropHint(view, event as DragEvent);
            dropHint = null;
            if (!hint) return false;

            const dragged = slice.content.firstChild;
            // 레이아웃을 레이아웃 안에 넣지 않는다 — 중첩은 편집·직렬화 양쪽에서 다루기 어렵다
            if (!dragged || dragged.type.name === COLUMN_BLOCK_NAME) return false;
            if (slice.content.childCount !== 1) return false;

            return splitIntoColumns(view, hint, dragged, moved);
          },
        },
      }),
    ];
  },
});

/** 커서 아래 최상위 블록의 좌/우 가장자리인지 판정한다. */
function computeDropHint(
  view: EditorView,
  event: { clientX: number; clientY: number },
): { pos: number; side: "left" | "right" } | null {
  const coords = { left: event.clientX, top: event.clientY };
  const found = view.posAtCoords(coords);
  if (!found) return null;

  const $pos = view.state.doc.resolve(found.inside >= 0 ? found.inside : found.pos);
  // 최상위 블록(문서 직계 자식)만 대상 — 열 안의 블록에 또 열을 만들면 중첩이 된다
  if ($pos.depth < 1) return null;
  const blockPos = $pos.before(1);
  const block = view.state.doc.nodeAt(blockPos);
  if (!block || block.type.name === COLUMN_BLOCK_NAME) return null;

  const dom = view.nodeDOM(blockPos);
  if (!(dom instanceof HTMLElement)) return null;
  const rect = dom.getBoundingClientRect();
  if (rect.width <= 0) return null;

  const ratio = (event.clientX - rect.left) / rect.width;
  if (ratio <= EDGE_RATIO) return { pos: blockPos, side: "left" };
  if (ratio >= 1 - EDGE_RATIO) return { pos: blockPos, side: "right" };
  return null;
}

/** 대상 블록과 끌어온 블록을 2열 레이아웃으로 감싼다. */
function splitIntoColumns(
  view: EditorView,
  hint: { pos: number; side: "left" | "right" },
  dragged: ProseMirrorNode,
  moved: boolean,
): boolean {
  const { state } = view;
  const target = state.doc.nodeAt(hint.pos);
  if (!target) return false;

  const tr = state.tr;
  // 이동(복사가 아님)이면 원본을 먼저 지운다 — 그러지 않으면 같은 블록이 둘이 된다
  if (moved && state.selection instanceof NodeSelection) {
    tr.delete(state.selection.from, state.selection.to);
  }
  const mappedPos = tr.mapping.map(hint.pos);
  const mappedTarget = tr.doc.nodeAt(mappedPos);
  if (!mappedTarget) return false;

  const columnType = state.schema.nodes[COLUMN_NAME];
  const blockType = state.schema.nodes[COLUMN_BLOCK_NAME];
  if (!columnType || !blockType) return false;

  const targetColumn = columnType.create(null, mappedTarget);
  const draggedColumn = columnType.create(null, dragged);
  const columns = hint.side === "left" ? [draggedColumn, targetColumn] : [targetColumn, draggedColumn];

  tr.replaceWith(mappedPos, mappedPos + mappedTarget.nodeSize, blockType.create(null, columns));
  view.dispatch(tr);
  return true;
}

/** 열 너비 드래그 — pointermove 동안 양옆 두 열의 비율만 바꾼다. */
function startResize(
  view: EditorView,
  event: PointerEvent,
  handle: HTMLElement,
  dragState: DragState,
) {
  const index = Number(handle.dataset.columnIndex);
  const columnDom = handle.closest<HTMLElement>('[data-type="column"]');
  const blockDom = columnDom?.closest<HTMLElement>('[data-type="column-block"]');
  if (!columnDom || !blockDom || !Number.isFinite(index) || index < 1) return;

  const found = findAncestor(view, columnDom, COLUMN_BLOCK_NAME);
  if (!found) return;

  const startWidths = currentWidths(found.node, blockDom);
  const totalWidth = blockDom.getBoundingClientRect().width;
  if (totalWidth <= 0) return;
  const startX = event.clientX;
  dragState.kind = "resize";
  document.body.classList.add("is-column-resizing");

  // 해제는 한 곳에서만 한다 — 등록한 이름과 해제하는 이름이 갈리면 리스너가 남는다(실제로 겪음)
  const stop = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", stop);
    document.body.classList.remove("is-column-resizing");
    dragState.kind = null;
  };

  const move = (e: PointerEvent) => {
    // 드래그 중 문서가 바뀌어(실행취소·외부 변경) 레이아웃이 사라졌으면 즉시 그만둔다 —
    // 캡처해둔 found.pos가 다른 노드를 가리키게 되면 엉뚱한 곳의 속성을 바꾼다
    if (!isStillSameBlock(view, found.pos)) {
      stop();
      return;
    }
    const deltaPercent = ((e.clientX - startX) / totalWidth) * 100;
    const left = startWidths[index - 1] + deltaPercent;
    const right = startWidths[index] - deltaPercent;
    // 양쪽 모두 최소치를 지킬 때만 반영한다 — 한쪽을 0으로 만들면 열이 사라진 것처럼 보인다
    if (left < MIN_WIDTH_PERCENT || right < MIN_WIDTH_PERCENT) return;
    const next = [...startWidths];
    next[index - 1] = left;
    next[index] = right;
    // 드래그 중엔 실행취소 기록을 쌓지 않는다 — 그러지 않으면 한 번 끈 것이 수십 스텝이 된다
    applyWidths(view, found.pos, next, false);
  };

  const finish = () => {
    // 마지막 상태 하나만 실행취소 대상으로 남긴다
    const block = view.state.doc.nodeAt(found.pos);
    if (block && block.type.name === COLUMN_BLOCK_NAME) {
      applyWidths(view, found.pos, currentWidths(block, blockDom), true);
    }
    stop();
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", stop);
}

/** 캡처해둔 위치가 아직 같은 레이아웃을 가리키는지 — 드래그 중 문서가 바뀔 수 있다. */
function isStillSameBlock(view: EditorView, pos: number): boolean {
  const node = view.state.doc.nodeAt(pos);
  return !!node && node.type.name === COLUMN_BLOCK_NAME;
}

function applyWidths(view: EditorView, blockPos: number, widths: number[], addToHistory: boolean) {
  const block = view.state.doc.nodeAt(blockPos);
  if (!block || block.childCount !== widths.length) return;
  const tr = view.state.tr;
  if (!addToHistory) tr.setMeta("addToHistory", false);
  let offset = blockPos + 1;
  block.forEach((child, _o, index) => {
    const width = Math.round(widths[index] * 10) / 10;
    tr.setNodeMarkup(offset, undefined, {
      ...child.attrs,
      width: width > 0 && width < 100 ? width : null,
    });
    offset += child.nodeSize;
  });
  view.dispatch(tr);
}

/** 열 재배치 — 그립을 놓은 지점의 열 인덱스로 옮긴다. */
function startReorder(view: EditorView, grip: HTMLElement, dragState: DragState) {
  const from = Number(grip.dataset.columnIndex);
  const blockDom = grip.closest<HTMLElement>('[data-type="column-block"]');
  if (!blockDom || !Number.isFinite(from)) return;

  const found = findAncestor(view, blockDom, COLUMN_BLOCK_NAME);
  if (!found) return;
  dragState.kind = "reorder";
  document.body.classList.add("is-column-reordering");

  const up = (e: PointerEvent) => {
    document.removeEventListener("pointerup", up);
    document.body.classList.remove("is-column-reordering");
    dragState.kind = null;

    const columnDoms = Array.from(blockDom.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.dataset.type === COLUMN_NAME,
    );
    const to = columnDoms.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right;
    });
    if (to < 0 || to === from) return;
    moveColumn(view, found.pos, from, to);
  };

  document.addEventListener("pointerup", up);
}

/** 열 순서 교체 — 내용과 너비를 함께 옮긴다(너비만 남으면 배치가 뒤바뀐 것처럼 보인다). */
export function moveColumn(view: EditorView, blockPos: number, from: number, to: number): boolean {
  const block = view.state.doc.nodeAt(blockPos);
  if (!block || block.type.name !== COLUMN_BLOCK_NAME) return false;
  if (from === to || from < 0 || to < 0 || from >= block.childCount || to >= block.childCount) {
    return false;
  }
  const children: ProseMirrorNode[] = [];
  block.forEach((child) => children.push(child));
  const [moving] = children.splice(from, 1);
  children.splice(to, 0, moving);

  const tr = view.state.tr.replaceWith(
    blockPos,
    blockPos + block.nodeSize,
    block.type.create(block.attrs, children),
  );
  view.dispatch(tr);
  return true;
}

/** 열 수 상한 — 끌어서 분할이 이 값을 넘기지 않는다. */
export const COLUMN_DRAG_MAX = clampColumnCount(MAX_COLUMN_COUNT);
