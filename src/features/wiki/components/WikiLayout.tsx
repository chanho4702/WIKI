import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, Outlet, useNavigate, useParams } from "react-router";
import { Avatar, Button, EmptyState, Spinner, Switch, TextField, TopBar } from "@chanho/react";
import type { Page, Space, User } from "../store/types";
import { getCurrentUser, listPages } from "../store/wikiStore";
import { useTheme } from "../../../app/theme";
import { useAuth } from "../../../auth/AuthGate";
import { PageTree } from "./PageTree";
import { SidebarResizer } from "./SidebarResizer";
import { SpaceCreateModal } from "./SpaceCreateModal";
import { SpaceFlyout } from "./SpaceFlyout";
import { filterPagesWithAncestors } from "./filterPagesWithAncestors";
import { useSidebarPrefs } from "../lib/sidebarPrefs";
import { pruneStarredSpaces, useStarredSpaces } from "../lib/starredSpaces";
import { useDismissablePopover } from "../lib/useDismissablePopover";

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
  const { starred } = useStarredSpaces();
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

  useEffect(() => {
    void getCurrentUser().then(setMe);
  }, []);

  // T3 잔여 픽스(b) — 스페이스 목록이 로드/갱신될 때마다 별표 저장 배열에서 더 이상 존재하지 않는
  // id를 정리한다(스페이스 삭제 등으로 죽은 id가 영구히 남는 것 방지). spaces prop은 App이 로드해
  // 내려주므로, 여기서는 그 값이 바뀔 때(최초 로드 포함) 1회씩 호출한다.
  useEffect(() => {
    pruneStarredSpaces(spaces.map((s) => s.id));
  }, [spaces]);

  // 스페이스 플라이아웃(W6 T3) — 사이드바 헤더의 Select를 대체하는 "현재 스페이스" 버튼 +
  // 옆에 뜨는 필터/전환 패널. 모달 open 상태는 여기(WikiLayout)로 끌어올려, 플라이아웃의
  // "스페이스 만들기" 버튼과 사이드바 푸터의 기존 SpaceCreateModal 트리거가 같은 모달 인스턴스를
  // 공유한다(기존 사용처·테스트는 그대로 유지 — SpaceCreateModal은 open/onOpenChange 미지정 시
  // 내부 상태로 동작하므로 EmptySpaces.tsx 등은 영향 없음).
  const [spaceFlyoutOpen, setSpaceFlyoutOpen] = useState(false);
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const spaceSwitcherRef = useRef<HTMLDivElement>(null);
  const spaceTriggerRef = useRef<HTMLButtonElement>(null);

  // 외부 클릭/Escape/Tab-out 닫기 — 공용 훅(useDismissablePopover.ts)에 위임한다. 트리거 버튼도
  // 포함하는 영역(spaceSwitcherRef) 바깥의 mousedown이면 닫기만 하고 포커스는 건드리지 않는다.
  // 트리거 버튼이 이 영역 "안"에 있으므로, 트리거를 다시 눌러 닫는 경우는 여기서 무시되고 트리거의
  // onClick 토글로만 처리된다(닫힘→토글로 즉시 재열림되는 경합을 피함). Escape는 컨테이너 전체
  // keydown으로 승격돼 있어(예: SpaceFlyout의 별표 버튼에 포커스가 가 있어도) 동작한다.
  const closeSpaceFlyout = useCallback(() => {
    setSpaceFlyoutOpen(false);
  }, []);
  useDismissablePopover({
    containerRef: spaceSwitcherRef,
    triggerRef: spaceTriggerRef,
    open: spaceFlyoutOpen,
    onClose: closeSpaceFlyout,
  });

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

  // 사이드바 별표 섹션(Task 6) — 현재 스페이스는 제외(이미 헤더 트리거로 보임), spaces에
  // 실존하는 것만(별표 저장 배열은 pruneStarredSpaces가 정리하지만 렌더 시점에도 방어적으로 필터).
  const starredSpaceList = spaces.filter((s) => s.id !== current.id && starred.includes(s.id));

  return (
    <div className="wiki-layout">
      <TopBar
        brand={
          <>
            <Button
              variant="ghost"
              size="small"
              className="wiki-sidebar-toggle"
              aria-label="사이드바 토글"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              ⧉
            </Button>
            <span className="wiki-brand">WIKI</span>
          </>
        }
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
        {collapsed ? null : (
          <aside className="wiki-sidebar" style={{ width: displayWidth }}>
            <div className="wiki-sidebar-header">
              <div className="space-switcher" ref={spaceSwitcherRef}>
                <button
                  ref={spaceTriggerRef}
                  type="button"
                  className="space-switcher-trigger"
                  aria-haspopup="dialog"
                  aria-expanded={spaceFlyoutOpen}
                  aria-label={`스페이스 전환: ${current.name}`}
                  onClick={() => setSpaceFlyoutOpen((prev) => !prev)}
                >
                  {current.name} ({current.key})
                </button>
                {spaceFlyoutOpen && (
                  <SpaceFlyout
                    spaces={spaces}
                    currentSpaceId={current.id}
                    onNavigate={(id) => {
                      setSpaceFlyoutOpen(false);
                      navigate(`/spaces/${id}`);
                    }}
                    onCreateClick={() => {
                      setSpaceFlyoutOpen(false);
                      setSpaceModalOpen(true);
                    }}
                  />
                )}
              </div>
            </div>
            <div className="wiki-sidebar-body">
              {starredSpaceList.length > 0 && (
                <section className="wiki-sidebar-starred" aria-label="별표 표시된 스페이스">
                  <h3 className="wiki-sidebar-section-title">별표 표시된 스페이스</h3>
                  <ul className="wiki-sidebar-starred-list">
                    {starredSpaceList.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="wiki-sidebar-starred-item"
                          onClick={() => navigate(`/spaces/${s.id}`)}
                        >
                          {s.name} ({s.key})
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <Link to="/spaces" className="wiki-sidebar-all-spaces-link">
                모든 스페이스 보기
              </Link>
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
                open={spaceModalOpen}
                onOpenChange={setSpaceModalOpen}
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
