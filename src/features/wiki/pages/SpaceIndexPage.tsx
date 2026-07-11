import { Navigate, useOutletContext, useParams } from "react-router";
import { Spinner } from "@chanho/react";
import type { WikiOutletContext } from "../components/WikiLayout";

/** /spaces/:spaceId index — 첫 루트 페이지로 redirect, 페이지 0개면 안내 EmptyState */
export function SpaceIndexPage() {
  const { spaceId } = useParams();
  const { pages } = useOutletContext<WikiOutletContext>();

  if (pages === null) {
    return <Spinner label="페이지 로딩 중" />;
  }
  const roots = pages
    .filter((p) => p.parentId === null)
    .sort((a, b) => a.position - b.position);
  if (roots.length === 0) {
    // 페이지 생성 라우트(/new)는 W2 — W1은 안내문만
    return (
      <div className="empty-pages">
        <h2>아직 페이지가 없습니다</h2>
        <p>첫 페이지 만들기는 다음 단계(W2)에서 제공됩니다.</p>
      </div>
    );
  }
  return <Navigate to={`/spaces/${spaceId}/pages/${roots[0].id}`} replace />;
}
