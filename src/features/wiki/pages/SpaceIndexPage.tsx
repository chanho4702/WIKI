import { Navigate, useNavigate, useOutletContext, useParams } from "react-router";
import { EmptyState, Spinner } from "@chanho/react";
import type { WikiOutletContext } from "../components/WikiLayout";

/** /spaces/:spaceId index — 첫 루트 페이지로 redirect, 페이지 0개면 첫 페이지 만들기 EmptyState */
export function SpaceIndexPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { pages } = useOutletContext<WikiOutletContext>();

  if (pages === null) {
    return <Spinner label="페이지 로딩 중" />;
  }
  const roots = pages
    .filter((p) => p.parentId === null)
    .sort((a, b) => a.position - b.position);
  if (roots.length === 0) {
    return (
      <div className="empty-pages">
        <EmptyState
          title="아직 페이지가 없습니다"
          description="첫 페이지를 만들어 위키를 시작하세요."
          primaryAction={{
            label: "첫 페이지 만들기",
            onClick: () => navigate(`/spaces/${spaceId}/pages/new`),
          }}
        />
      </div>
    );
  }
  return <Navigate to={`/spaces/${spaceId}/pages/${roots[0].id}`} replace />;
}
