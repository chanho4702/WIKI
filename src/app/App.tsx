import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Navigate, Route, Routes, useParams } from "react-router";
import { Button, Spinner } from "@chanho/react";
import type { Space } from "../features/wiki/store/types";
import { listSpaces } from "../features/wiki/store/wikiStore";
import { AppShell } from "../features/wiki/components/AppShell";
import { EmptySpaces } from "../features/wiki/components/EmptySpaces";
import { SpaceIndexPage } from "../features/wiki/pages/SpaceIndexPage";
import { SpaceDirectoryPage } from "../features/wiki/pages/SpaceDirectoryPage";
import { HomePage } from "../features/wiki/pages/HomePage";
import { PageViewPage } from "../features/wiki/pages/PageViewPage";
import { PageHistoryPage } from "../features/wiki/pages/PageHistoryPage";
import { PageVersionPage } from "../features/wiki/pages/PageVersionPage";
import { PageCompareVersionsPage } from "../features/wiki/pages/PageCompareVersionsPage";
import { FolderPage } from "../features/wiki/pages/FolderPage";
import { SearchPage } from "../features/wiki/pages/SearchPage";
import { TasksPage } from "../features/wiki/pages/TasksPage";
import { NotificationSettingsPage } from "../features/wiki/pages/NotificationSettingsPage";
import { SearchAdminPage } from "../features/wiki/pages/SearchAdminPage";
import { OrgAdminPage } from "../features/wiki/pages/OrgAdminPage";
import { SpaceAuditAdminPage } from "../features/wiki/pages/SpaceAuditAdminPage";
import { MigrationsAdminPage } from "../features/wiki/pages/MigrationsAdminPage";
import { MigrationJobPage } from "../features/wiki/pages/MigrationJobPage";
import { TrashPage } from "../features/wiki/pages/TrashPage";
import { ArchivePage } from "../features/wiki/pages/ArchivePage";
import { LabelsPage } from "../features/wiki/pages/LabelsPage";
import { BlogPage } from "../features/wiki/pages/BlogPage";
import { SpaceSettingsPage } from "../features/wiki/pages/SpaceSettingsPage";
import { useReadOnly } from "../features/wiki/lib/readOnly";

/**
 * 편집기를 이 산출물에 넣을지 — **빌드 상수**다(설계 §2.2).
 *
 * 라우팅 판단은 useReadOnly() 컨텍스트로 하지만, 컨텍스트는 런타임 값이라 rollup이 dynamic
 * import를 지울 수 없다. 공개 문서 빌드에서 편집기 청크까지 빠지려면 정적으로 접힐 수 있는
 * 조건이 필요해 여기서만 env를 직접 읽는다. 테스트·팀 위키 빌드는 항상 true다.
 */
const EDITOR_BUNDLED = import.meta.env.VITE_WIKI_READONLY !== "true";

/**
 * 편집 화면만 지연 로딩한다(2026-08-29).
 *
 * TipTap 확장 묶음이 번들의 큰 덩어리인데, 읽기만 하는 사용자는 한 번도 쓰지 않는다.
 * 나머지 화면은 크기가 작아 쪼갤수록 왕복만 늘어 그대로 둔다.
 */
const PageEditPage: ComponentType = EDITOR_BUNDLED
  ? lazy(() => import("../features/wiki/pages/PageEditPage").then((m) => ({ default: m.PageEditPage })))
  : () => null;

/**
 * 읽기 전용 인스턴스에서 제외한 경로(편집·설정·휴지통 등)로 들어오면 그 스페이스 홈으로 돌린다.
 * 404가 아니라 리다이렉트인 이유: 팀 위키에서 복사해 온 링크가 공개 문서에서도 "읽을 수 있는
 * 가장 가까운 곳"에 닿아야 한다.
 */
function RedirectToSpace({ fallbackSpaceId }: { fallbackSpaceId: string }) {
  const { spaceId } = useParams();
  return <Navigate to={`/spaces/${spaceId ?? fallbackSpaceId}`} replace />;
}

/** 편집 화면 청크를 받는 동안의 자리표시 — 보기 화면의 스켈레톤과 같은 톤. */
function EditorFallback() {
  return (
    <div className="app-loading">
      <Spinner size="large" label="편집기 불러오는 중" />
    </div>
  );
}

export function App() {
  // 공개 문서 인스턴스(설계 §2.2) — 쓰기 화면 자체를 라우팅에서 뺀다. 어포던스를 숨기는 것만으로는
  // 주소를 직접 친 사람에게 편집기가 열려 저장 시 403을 받는다(서버가 막지만 화면이 거짓말을 한다).
  const readOnly = useReadOnly();
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
        <Route path="/search" element={<SearchPage />} />
        {/* 로그인 사용자에게만 의미가 있는 화면들 — 익명 공개 인스턴스에서는 라우트째 없앤다 */}
        {readOnly ? null : (
          <>
            {/* 내 작업(W23) — 담당자가 나인 체크박스 항목을 문서를 가로질러 모은다 */}
            <Route path="/tasks" element={<TasksPage />} />
            {/* 알림 설정(W23) — 이메일 채널 스위치. 사용자 메뉴·알림함 하단에서 온다 */}
            <Route path="/settings/notifications" element={<NotificationSettingsPage />} />
            {/* 검색 색인 관리 — 전역 관리자 전용. 아니면 화면이 스스로 "권한 없음"을 보여준다 */}
            <Route path="/admin/search" element={<SearchAdminPage />} />
            {/* 사용자·팀 관리(U4) — 공용 패키지 `@chanho/org-admin`을 마운트한다(설계 §6).
              * 사용자·초대·팀·전역 역할·승인 대기가 한 셸 안에 있고, 권한 판정은 서버가 한다. */}
            <Route path="/admin/org/*" element={<OrgAdminPage />} />
            {/* 팀 관리 화면은 위 패키지의 "팀" 탭으로 옮겼다 — 기존 링크·북마크를 살린다 */}
            <Route path="/admin/teams" element={<Navigate to="/admin/org/teams" replace />} />
            {/* 스페이스 삭제 기록 — 전역 관리자 전용(서버가 판정). 스페이스 안에서는 읽을 곳이 없는 기록 */}
            <Route path="/admin/audit" element={<SpaceAuditAdminPage />} />
            {/* 컨플루언스 DC 이관(M1) — 전역 관리자 전용(서버가 판정). 목록+새 잡, 그리고 잡 상세 */}
            <Route path="/admin/migrations" element={<MigrationsAdminPage />} />
            <Route path="/admin/migrations/:jobId" element={<MigrationJobPage />} />
          </>
        )}
        {/* 스페이스 컨텍스트 — element 없이 경로만 묶는다. 하위 페이지 화면은 AppShell의 Outlet
         * 컨텍스트(pages/space/reloadPages)를 그대로 소비한다. */}
        <Route path="/spaces/:spaceId">
          <Route index element={<SpaceIndexPage />} />
          {readOnly ? (
            <>
              {/* 편집기 청크는 lazy라 이 라우트가 없으면 번들에서도 빠진다 */}
              <Route path="pages/new" element={<RedirectToSpace fallbackSpaceId={spaces[0].id} />} />
              <Route path="pages/:pageId/edit" element={<RedirectToSpace fallbackSpaceId={spaces[0].id} />} />
              {/* 히스토리도 쓰기 화면이다 — 복원 버튼이 있고, 공개 문서에는 편집 주체가 없다 */}
              <Route path="pages/:pageId/history/*" element={<RedirectToSpace fallbackSpaceId={spaces[0].id} />} />
              <Route path="trash" element={<RedirectToSpace fallbackSpaceId={spaces[0].id} />} />
              <Route path="archive" element={<RedirectToSpace fallbackSpaceId={spaces[0].id} />} />
              <Route path="settings" element={<RedirectToSpace fallbackSpaceId={spaces[0].id} />} />
              <Route path="settings/:section" element={<RedirectToSpace fallbackSpaceId={spaces[0].id} />} />
            </>
          ) : (
            <>
              <Route
                path="pages/new"
                element={
                  <Suspense fallback={<EditorFallback />}>
                    <PageEditPage key="new" />
                  </Suspense>
                }
              />
              <Route
                path="pages/:pageId/edit"
                element={
                  <Suspense fallback={<EditorFallback />}>
                    <PageEditPage key="edit" />
                  </Suspense>
                }
              />
              {/*
                페이지 히스토리(W30) — 모달이 아니라 전용 화면 셋이다. 비교 대상·보고 있는 버전이
                주소에 남아야 공유·북마크·뒤로가기가 성립한다. `:version`은 내부 id가 아니라
                버전 번호이고, 정적 경로인 compare가 그 앞에 온다.
              */}
              <Route path="pages/:pageId/history" element={<PageHistoryPage />} />
              <Route path="pages/:pageId/history/compare" element={<PageCompareVersionsPage />} />
              <Route path="pages/:pageId/history/:version" element={<PageVersionPage />} />
              {/* 휴지통은 스페이스 스코프 — 컨플루언스 스페이스 설정의 휴지통 위치를 따른다 */}
              <Route path="trash" element={<TrashPage />} />
              {/* 보관함(W23) — 끝났지만 남겨 둔 문서. 휴지통과 같은 표를 쓴다 */}
              <Route path="archive" element={<ArchivePage />} />
              {/*
                스페이스 설정 — 전용 사이드바를 가진 별도 화면(W23). 어느 설정을 보고 있는지가
                URL에 남아야 공유·북마크·뒤로가기가 성립한다.
              */}
              <Route path="settings" element={<SpaceSettingsPage />} />
              <Route path="settings/:section" element={<SpaceSettingsPage />} />
            </>
          )}
          <Route path="pages/:pageId" element={<PageViewPage />} />
          {/* 폴더는 본문이 없어 페이지와 다른 화면을 연다(기획 P1) — 경로도 분리한다 */}
          <Route path="folder/:folderId" element={<FolderPage />} />
          {/* 라벨 탐색 — 트리로는 못 찾는 가로 분류(컨플루언스 "라벨로 찾아보기") */}
          {/* 블로그(W24) — 트리 밖 글 목록. 글 자체는 pages/:pageId로 연다 */}
          <Route path="blog" element={<BlogPage />} />
          <Route path="labels" element={<LabelsPage />} />
          <Route path="labels/:name" element={<LabelsPage />} />
        </Route>
        {/* "/" 포함 그 외 전부 → 첫 스페이스 (index는 스페이스 개요를 보여준다) */}
        <Route path="*" element={<Navigate to={`/spaces/${spaces[0].id}`} replace />} />
      </Route>
    </Routes>
  );
}
