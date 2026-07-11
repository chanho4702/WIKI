import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate, useParams } from "react-router";
import { Avatar, Select, Spinner } from "@chanho/react";
import type { Page, Space, User } from "../store/types";
import { getCurrentUser, listPages } from "../store/wikiStore";
import { PageTree } from "./PageTree";
import { SpaceCreateModal } from "./SpaceCreateModal";

export interface WikiLayoutProps {
  spaces: Space[];
  /** 스페이스 목록이 바뀌었을 때(생성 등) App이 다시 로드하도록 알린다 */
  onSpacesChanged: () => void | Promise<void>;
}

/** Outlet으로 하위 라우트에 전달하는 컨텍스트 (SpaceIndexPage가 사용) */
export interface WikiOutletContext {
  pages: Page[] | null;
}

export function WikiLayout({ spaces, onSpacesChanged }: WikiLayoutProps) {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<User | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);

  useEffect(() => {
    void getCurrentUser().then(setMe);
  }, []);

  const current = spaces.find((s) => s.id === spaceId);
  const currentId = current?.id ?? null;

  useEffect(() => {
    if (!currentId) return;
    setPages(null);
    void listPages(currentId).then(setPages);
  }, [currentId]);

  if (!current) {
    // 존재하지 않는 스페이스 ID → 첫 스페이스로
    return <Navigate to={`/spaces/${spaces[0].id}`} replace />;
  }

  return (
    <div className="wiki-layout">
      <aside className="wiki-sidebar">
        <div className="wiki-sidebar-brand">WIKI</div>
        <Select
          label="스페이스"
          options={spaces.map((s) => ({ value: s.id, label: `${s.name} (${s.key})` }))}
          value={current.id}
          onValueChange={(id) => navigate(`/spaces/${id}`)}
        />
        {pages === null ? (
          <Spinner size="small" label="페이지 트리 로딩 중" />
        ) : (
          <PageTree spaceId={current.id} pages={pages} />
        )}
        <SpaceCreateModal
          onCreated={async (space) => {
            await onSpacesChanged();
            navigate(`/spaces/${space.id}`);
          }}
        />
      </aside>
      <div className="wiki-main">
        <header className="wiki-header">{me ? <Avatar name={me.name} size="small" /> : null}</header>
        <main className="wiki-content">
          <Outlet context={{ pages } satisfies WikiOutletContext} />
        </main>
      </div>
    </div>
  );
}
