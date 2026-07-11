import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import type { Page } from "../store/types";

export interface PageTreeProps {
  spaceId: string;
  pages: Page[];
  /** true면 접힘 상태를 무시하고 전부 펼친다(검색 중) — 접기 토글도 숨긴다 */
  forceExpand?: boolean;
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

/** 접이식 페이지 트리 — 기본 전부 펼침. 항목마다 하위 페이지 추가 액션(hover/focus 시 노출). */
export function PageTree({ spaceId, pages, forceExpand = false }: PageTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const roots = buildTree(pages);

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNodes = (nodes: TreeNode[]) => (
    <ul className="page-tree-list">
      {nodes.map(({ page, children }) => {
        const isCollapsed = !forceExpand && collapsed.has(page.id);
        return (
          <li key={page.id}>
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
          </li>
        );
      })}
    </ul>
  );

  if (roots.length === 0) {
    return <p className="page-tree-empty">페이지 없음</p>;
  }
  return (
    <nav className="page-tree" aria-label="페이지 트리">
      {renderNodes(roots)}
    </nav>
  );
}
