import { Link } from "react-router";
import type { Page } from "../store/types";

export interface ChildPagesProps {
  pages: Page[];
  currentPageId: string;
  spaceId: string;
}

export function ChildPages({ pages, currentPageId, spaceId }: ChildPagesProps) {
  // parentId === currentPageId인 페이지들만 필터링
  const childPages = pages.filter((p) => p.parentId === currentPageId);

  // 자식 페이지가 없으면 null 반환
  if (childPages.length === 0) {
    return null;
  }

  // position 오름차순 정렬
  childPages.sort((a, b) => a.position - b.position);

  return (
    <section className="child-pages">
      <h2>하위 페이지</h2>
      <ul>
        {childPages.map((page) => (
          <li key={page.id}>
            <Link to={`/spaces/${spaceId}/pages/${page.id}`}>{page.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
