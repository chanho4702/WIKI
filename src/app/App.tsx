import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Spinner } from "@chanho/react";
import type { Space } from "../features/wiki/store/types";
import { listSpaces } from "../features/wiki/store/wikiStore";
import { WikiLayout } from "../features/wiki/components/WikiLayout";
import { EmptySpaces } from "../features/wiki/components/EmptySpaces";
import { SpaceIndexPage } from "../features/wiki/pages/SpaceIndexPage";
import { SpaceDirectoryPage } from "../features/wiki/pages/SpaceDirectoryPage";
import { PageViewPage } from "../features/wiki/pages/PageViewPage";
import { PageEditPage } from "../features/wiki/pages/PageEditPage";

export function App() {
  const [spaces, setSpaces] = useState<Space[] | null>(null);

  const reload = useCallback(async () => {
    setSpaces(await listSpaces());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (spaces === null) {
    return (
      <div className="app-loading">
        <Spinner size="large" label="불러오는 중" />
      </div>
    );
  }

  if (spaces.length === 0) {
    return <EmptySpaces onCreated={reload} />;
  }

  return (
    <Routes>
      {/* W7 T7: 스페이스 디렉토리 — WikiLayout(스페이스 종속 사이드바) 밖의 독립 라우트라
       * "/spaces/:spaceId"보다 먼저, catch-all "*"보다 먼저 와야 한다. */}
      <Route path="/spaces" element={<SpaceDirectoryPage spaces={spaces} />} />
      <Route
        path="/spaces/:spaceId"
        element={<WikiLayout spaces={spaces} onSpacesChanged={reload} />}
      >
        <Route index element={<SpaceIndexPage />} />
        <Route path="pages/new" element={<PageEditPage key="new" />} />
        <Route path="pages/:pageId" element={<PageViewPage />} />
        <Route path="pages/:pageId/edit" element={<PageEditPage key="edit" />} />
      </Route>
      {/* "/" 포함 그 외 전부 → 첫 스페이스 (index가 첫 루트 페이지로 이어서 redirect) */}
      <Route path="*" element={<Navigate to={`/spaces/${spaces[0].id}`} replace />} />
    </Routes>
  );
}
