import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import type { Page } from "../store/types";

export interface PageTreeProps {
  spaceId: string;
  pages: Page[];
}

interface TreeNode {
  page: Page;
  children: TreeNode[];
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

/** 접이식 페이지 트리 — 기본 전부 펼침. 항목마다 하위 페이지 추가 액션(상시 노출). */
export function PageTree({ spaceId, pages }: PageTreeProps) {
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
        const isCollapsed = collapsed.has(page.id);
        return (
          <li key={page.id}>
            <div className="page-tree-row">
              {children.length > 0 ? (
                <button
                  type="button"
                  className="page-tree-toggle"
                  aria-expanded={!isCollapsed}
                  aria-label={
                    isCollapsed ? `${page.title} 하위 펼치기` : `${page.title} 하위 접기`
                  }
                  onClick={() => toggle(page.id)}
                >
                  {isCollapsed ? "▸" : "▾"}
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
                ＋
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
