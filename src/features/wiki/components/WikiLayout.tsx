import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useNavigate, useParams } from "react-router";
import { Avatar, Button, EmptyState, Select, Spinner, Switch, TextField, TopBar } from "@chanho/react";
import type { Page, Space, User } from "../store/types";
import { getCurrentUser, listPages } from "../store/wikiStore";
import { useTheme } from "../../../app/theme";
import { useAuth } from "../../../auth/AuthGate";
import { PageTree } from "./PageTree";
import { SidebarResizer } from "./SidebarResizer";
import { SpaceCreateModal } from "./SpaceCreateModal";
import { filterPagesWithAncestors } from "./filterPagesWithAncestors";
import { useSidebarPrefs } from "../lib/sidebarPrefs";

export interface WikiLayoutProps {
  spaces: Space[];
  /** 스페이스 목록이 바뀌었을 때(생성 등) App이 다시 로드하도록 알린다 */
  onSpacesChanged: () => void | Promise<void>;
}

/** Outlet으로 하위 라우트에 전달하는 컨텍스트 */
export interface WikiOutletContext {
  pages: Page[] | null;
  /** 현재 스페이스 (Breadcrumbs의 스페이스 이름 등) */
  space: Space;
  /** 페이지 생성/수정/삭제 후 사이드바 트리를 다시 로드한다 */
  reloadPages: () => Promise<void>;
}

export function WikiLayout({ spaces, onSpacesChanged }: WikiLayoutProps) {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { user: authUser, logout } = useAuth();
  const [me, setMe] = useState<User | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [query, setQuery] = useState("");
  const { collapsed, width, setCollapsed, setWidth } = useSidebarPrefs();
  // 드래그 중 실시간 미리보기 폭 — pointermove마다 저장하지 않고 화면 표시만 갱신한다.
  // 저장된 폭(width)이 바뀌면(예: 마운트 시 localStorage 복원) 같이 맞춘다.
  const [displayWidth, setDisplayWidth] = useState(width);
  useEffect(() => {
    setDisplayWidth(width);
  }, [width]);

  const handleResizeCommit = useCallback(
    (px: number) => {
      setDisplayWidth(px);
      setWidth(px);
    },
    [setWidth],
  );

  // 접기/열기 토글 후 포커스를 상대 버튼으로 옮긴다 — 그렇지 않으면 클릭한 버튼이 DOM에서
  // 사라지면서 포커스가 body로 떨어져 키보드 사용자가 위치를 잃는다.
  // 초기 마운트에서는 옮기지 않는다(첫 렌더에서 포커스를 훔치면 안 됨) — isFirstRender로 가드.
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (collapsed) {
      openButtonRef.current?.focus();
    } else {
      closeButtonRef.current?.focus();
    }
  }, [collapsed]);

  useEffect(() => {
    void getCurrentUser().then(setMe);
  }, []);

  const current = spaces.find((s) => s.id === spaceId);
  const currentId = current?.id ?? null;

  useEffect(() => {
    if (!currentId) return;
    setPages(null);
    setQuery(""); // 스페이스 전환 시 검색 초기화
    void listPages(currentId).then(setPages);
  }, [currentId]);

  const reloadPages = useCallback(async () => {
    if (!currentId) return;
    setPages(await listPages(currentId));
  }, [currentId]);

  if (!current) {
    // 존재하지 않는 스페이스 ID → 첫 스페이스로
    return <Navigate to={`/spaces/${spaces[0].id}`} replace />;
  }

  const searching = query.trim().length > 0;
  // 검색어가 비어 있으면 원본 배열 그대로 (원상복귀). Outlet context에는 항상 전체 pages를 준다
  const visiblePages = pages === null ? null : filterPagesWithAncestors(pages, query);

  return (
    <div className="wiki-layout">
      <TopBar
        brand={<span className="wiki-brand">WIKI</span>}
        actions={
          <>
            <Switch
              label="다크 모드"
              checked={theme === "dark"}
              onCheckedChange={toggle}
            />
            {authUser ? (
              <>
                <span className="wiki-auth-user">{authUser.name ?? authUser.email}</span>
                <Button size="small" variant="ghost" onClick={() => void logout()}>
                  로그아웃
                </Button>
              </>
            ) : null}
            {me ? <Avatar name={me.name} size="small" /> : null}
          </>
        }
      />
      <div className="wiki-body">
        {collapsed ? (
          <Button
            ref={openButtonRef}
            className="wiki-sidebar-opener"
            variant="subtle"
            size="small"
            aria-label="사이드바 열기"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(false)}
          >
            »
          </Button>
        ) : (
          <aside className="wiki-sidebar" style={{ width: displayWidth }}>
            <div className="wiki-sidebar-header">
              <Select
                label="스페이스"
                options={spaces.map((s) => ({ value: s.id, label: `${s.name} (${s.key})` }))}
                value={current.id}
                onValueChange={(id) => navigate(`/spaces/${id}`)}
              />
              <Button
                ref={closeButtonRef}
                variant="ghost"
                size="small"
                aria-label="사이드바 접기"
                aria-expanded={!collapsed}
                onClick={() => setCollapsed(true)}
              >
                «
              </Button>
            </div>
            <div className="wiki-sidebar-body">
              <TextField
                label="페이지 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목으로 검색"
              />
              {visiblePages === null ? (
                <Spinner size="small" label="페이지 트리 로딩 중" />
              ) : searching && visiblePages.length === 0 ? (
                <EmptyState title="검색 결과 없음" description="다른 검색어를 입력해 보세요." />
              ) : (
                <PageTree
                  spaceId={current.id}
                  pages={visiblePages}
                  forceExpand={searching}
                  onMoved={reloadPages}
                />
              )}
            </div>
            <div className="wiki-sidebar-footer">
              <Button variant="subtle" onClick={() => navigate(`/spaces/${current.id}/pages/new`)}>
                새 페이지
              </Button>
              <SpaceCreateModal
                onCreated={async (space) => {
                  await onSpacesChanged();
                  navigate(`/spaces/${space.id}`);
                }}
              />
            </div>
            <SidebarResizer width={displayWidth} onDrag={setDisplayWidth} onCommit={handleResizeCommit} />
          </aside>
        )}
        <main className="wiki-content">
          <Outlet context={{ pages, space: current, reloadPages } satisfies WikiOutletContext} />
        </main>
      </div>
    </div>
  );
}
