import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useToast } from "@chanho/react";
import type { ReactNode } from "react";
import type { Page } from "../store/types";
import { movePage } from "../store/wikiStore";
import { projectDrop, type FlatDropNode } from "./pageTreeDnd";

export interface PageTreeProps {
  spaceId: string;
  pages: Page[];
  /** true면 접힘 상태를 무시하고 전부 펼친다(검색 중) — 접기 토글도 숨긴다 */
  forceExpand?: boolean;
  /** 드래그로 페이지를 이동한 뒤 호출 — 주어지지 않으면 드래그 비활성 */
  onMoved?: () => void | Promise<void>;
}

interface TreeNode {
  page: Page;
  children: TreeNode[];
}

/** 접기/펼치기 토글 글리프 — 접힘 시 오른쪽, 펼침 시 CSS로 90도 회전. */
function ChevronIcon() {
  return (
    <svg
      className="page-tree-toggle-icon"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 2.5L8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 하위 페이지 추가 글리프. */
function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M6 2.5v7M2.5 6h7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** parentId 인접 리스트 → 트리. 형제는 position 오름차순. */
function buildTree(pages: Page[]): TreeNode[] {
  const byParent = new Map<string | null, Page[]>();
  for (const page of pages) {
    const siblings = byParent.get(page.parentId) ?? [];
    siblings.push(page);
    byParent.set(page.parentId, siblings);
  }
  const toNodes = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((page) => ({ page, children: toNodes(page.id) }));
  return toNodes(null);
}

/** 한 깊이당 들여쓰기 픽셀 — projectDrop의 offsetX 환산 기준 */
const INDENT_PX = 24;

interface FlatNode {
  page: Page;
  depth: number;
}

/** 화면에 보이는 순서대로 평탄화 — activeId의 자손은 제외(드래그 중 함께 이동하므로) */
function flattenVisible(
  roots: TreeNode[],
  collapsed: Set<string>,
  forceExpand: boolean,
  activeId: string | null,
): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ page: node.page, depth });
      const hideChildren =
        node.page.id === activeId || (!forceExpand && collapsed.has(node.page.id));
      if (!hideChildren) walk(node.children, depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}

/**
 * 드래그 가능한 트리 항목(li). useSortable의 attributes는 li에 role="button"을 붙여
 * 링크/트리 시맨틱을 해치므로 listeners만 스프레드한다(포인터 드래그 전용 — 스펙 4.1).
 */
function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "page-tree-dragging" : undefined}
      {...listeners}
    >
      {children}
    </li>
  );
}

export function PageTree({ spaceId, pages, forceExpand = false, onMoved }: PageTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const roots = buildTree(pages);
  // 검색 필터 중에는 부분 트리라 위치 계산이 모호하므로 드래그를 끈다 (스펙 4.1)
  const dragEnabled = !forceExpand && onMoved !== undefined;
  const flat = flattenVisible(roots, collapsed, forceExpand, activeId);
  // 클릭(네비게이션)과 드래그 구분 — 6px 이상 움직여야 드래그 시작
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveId(null);
    if (!over) return;
    const dropNodes: FlatDropNode[] = flat.map((f) => ({
      id: f.page.id,
      parentId: f.page.parentId,
      depth: f.depth,
    }));
    const drop = projectDrop(dropNodes, String(active.id), String(over.id), delta.x, INDENT_PX);
    if (!drop) return;
    try {
      await movePage(String(active.id), drop);
      await onMoved?.();
    } catch (error) {
      toast({
        title: "페이지 이동 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const renderNodes = (nodes: TreeNode[]) => (
    <ul className="page-tree-list">
      {nodes.map(({ page, children }) => {
        const isCollapsed = !forceExpand && collapsed.has(page.id);
        const row = (
          <>
            <div className="page-tree-row">
              {children.length > 0 && !forceExpand ? (
                <button
                  type="button"
                  className="page-tree-toggle"
                  aria-expanded={!isCollapsed}
                  aria-label={
                    isCollapsed ? `${page.title} 하위 펼치기` : `${page.title} 하위 접기`
                  }
                  onClick={() => toggle(page.id)}
                >
                  <ChevronIcon />
                </button>
              ) : (
                <span className="page-tree-toggle-spacer" aria-hidden="true" />
              )}
              <NavLink to={`/spaces/${spaceId}/pages/${page.id}`}>{page.title}</NavLink>
              {/* NavLink의 형제 — 링크 안에 버튼 중첩 금지 */}
              <button
                type="button"
                className="page-tree-add"
                aria-label={`${page.title} 하위 페이지 추가`}
                onClick={() => navigate(`/spaces/${spaceId}/pages/new?parent=${page.id}`)}
              >
                <PlusIcon />
              </button>
            </div>
            {children.length > 0 && !isCollapsed ? renderNodes(children) : null}
          </>
        );
        return dragEnabled ? (
          <SortableRow key={page.id} id={page.id}>
            {row}
          </SortableRow>
        ) : (
          <li key={page.id}>{row}</li>
        );
      })}
    </ul>
  );

  if (roots.length === 0) {
    return <p className="page-tree-empty">페이지 없음</p>;
  }
  return (
    <nav className="page-tree" aria-label="페이지 트리">
      {dragEnabled ? (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext
            items={flat.map((f) => f.page.id)}
            strategy={verticalListSortingStrategy}
          >
            {renderNodes(roots)}
          </SortableContext>
        </DndContext>
      ) : (
        renderNodes(roots)
      )}
    </nav>
  );
}
