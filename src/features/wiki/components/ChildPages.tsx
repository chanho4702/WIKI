import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { PageNode } from "../store/types";
import { listChildren } from "../store/wikiStore";

export interface ChildPagesProps {
  currentPageId: string;
  spaceId: string;
}

/**
 * 본문 아래 "하위 페이지" 목록.
 *
 * 직계 자식만 서버에서 읽는다(2026-08-28). 예전에는 화면이 들고 있던 스페이스 전 페이지를
 * 걸러 썼는데, 그 배열 자체가 규모 상한이었다.
 */
export function ChildPages({ currentPageId, spaceId }: ChildPagesProps) {
  const [children, setChildren] = useState<PageNode[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listChildren(spaceId, currentPageId)
      .then((found) => {
        if (!cancelled) setChildren(found);
      })
      .catch(() => {
        if (!cancelled) setChildren([]); // 부가 목록이라 실패해도 본문을 막지 않는다
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId, currentPageId]);

  if (children.length === 0) return null;

  return (
    <section className="child-pages">
      <h2>하위 페이지</h2>
      <ul>
        {children.map((page) => (
          <li key={page.id}>
            <Link to={`/spaces/${spaceId}/pages/${page.id}`}>{page.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
