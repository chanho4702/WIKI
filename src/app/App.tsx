import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Button, Spinner } from "@chanho/react";
import type { Space } from "../features/wiki/store/types";
import { listSpaces } from "../features/wiki/store/wikiStore";
import { AppShell } from "../features/wiki/components/AppShell";
import { EmptySpaces } from "../features/wiki/components/EmptySpaces";
import { SpaceIndexPage } from "../features/wiki/pages/SpaceIndexPage";
import { SpaceDirectoryPage } from "../features/wiki/pages/SpaceDirectoryPage";
import { HomePage } from "../features/wiki/pages/HomePage";
import { PageViewPage } from "../features/wiki/pages/PageViewPage";
import { FolderPage } from "../features/wiki/pages/FolderPage";
import { PageEditPage } from "../features/wiki/pages/PageEditPage";

export function App() {
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  // 스페이스 로드 실패(예: 백엔드 모드에서 권한 서비스 불가 503) — 빈 목록으로 조용히 삼키지 않고
  // 에러 화면 + 재시도로 노출한다(설계 §9 관측성).
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setSpaces(await listSpaces());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error !== null) {
    return (
      <div className="app-loading">
        <p>스페이스를 불러올 수 없습니다: {error}</p>
        <Button onClick={() => void reload()}>다시 시도</Button>
      </div>
    );
  }

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
      {/* 글로벌 셸 — 모든 라우트를 감싼다(헤더 토글 상시 + GlobalSidebar). 스페이스 라우트에서만
       * 페이지 트리를 로드해 WikiOutletContext를 하위 페이지 화면에 공급한다(설계 §2). */}
      <Route element={<AppShell spaces={spaces} onSpacesChanged={reload} />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/spaces" element={<SpaceDirectoryPage spaces={spaces} />} />
        {/* 스페이스 컨텍스트 — element 없이 경로만 묶는다. 하위 페이지 화면은 AppShell의 Outlet
         * 컨텍스트(pages/space/reloadPages)를 그대로 소비한다. */}
        <Route path="/spaces/:spaceId">
          <Route index element={<SpaceIndexPage />} />
          <Route path="pages/new" element={<PageEditPage key="new" />} />
          <Route path="pages/:pageId" element={<PageViewPage />} />
          <Route path="pages/:pageId/edit" element={<PageEditPage key="edit" />} />
          {/* 폴더는 본문이 없어 페이지와 다른 화면을 연다(기획 P1) — 경로도 분리한다 */}
          <Route path="folder/:folderId" element={<FolderPage />} />
        </Route>
        {/* "/" 포함 그 외 전부 → 첫 스페이스 (index는 스페이스 개요를 보여준다) */}
        <Route path="*" element={<Navigate to={`/spaces/${spaces[0].id}`} replace />} />
      </Route>
    </Routes>
  );
}
