import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { Avatar, EmptyState, Spinner, TextField } from "@chanho/react";
import { Clock, Compass, ExternalLink, Grid3x3, House, Plus, Star } from "lucide-react";
import type { Page, Space } from "../store/types";
import { PageTree } from "./PageTree";
import { useCreateContent } from "../lib/useCreateContent";
import { CreateContentMenu } from "./CreateContentMenu";
import { SidebarResizer } from "./SidebarResizer";
import { SpaceFlyout } from "./SpaceFlyout";
import { filterPagesWithAncestors } from "./filterPagesWithAncestors";
import { useSidebarPrefs } from "../lib/sidebarPrefs";
import { useStarredSpaces } from "../lib/starredSpaces";
import { useDismissablePopover } from "../lib/useDismissablePopover";

export interface GlobalSidebarProps {
  spaces: Space[];
  /** 현재 스페이스 — 스페이스 라우트면 해당 스페이스, 홈·디렉토리면 null */
  space: Space | null;
  /** 현재 스페이스의 페이지 트리 (AppShell이 로드) — 스페이스 밖이면 null */
  pages: Page[] | null;
  /** 페이지 이동 후 트리 재로드 (AppShell의 reloadPages) */
  reloadPages: () => Promise<void>;
  /** 스페이스 플라이아웃/컨텍스트 하단의 "스페이스 만들기" — AppShell의 공유 모달을 연다 */
  onCreateSpace: () => void;
}

/**
 * 컨플루언스 글로벌 셸의 좌측 사이드바 (설계 §1.2 — `2026-07-22-confluence-shell-design.md`).
 * 3단 구조: (1) 글로벌 네비(추천/최근/별표 표시/스페이스/앱, 모든 화면 공통) ·
 * (2) 컨텍스트 섹션(스페이스 안이면 스페이스 헤더 + "콘텐츠"(페이지 트리+검색)만 — 순수 스페이스
 * 스코프. 홈·디렉토리면 별표 스페이스 목록 + "모든 스페이스 보기") · (3) 푸터(Jira 크로스앱 링크).
 * AppShell이 접힘 상태에 따라 이 컴포넌트를 마운트/언마운트한다(접히면 aside 자체가 사라지는 기존
 * 동작 유지 — App.w5-sidebar 테스트 계약).
 *
 * 별표 스페이스 목록/디렉토리 링크는 컨플루언스처럼 홈·디렉토리 컨텍스트에만 둔다 — 스페이스
 * 사이드바에 노출하면 스코프가 섞인다(디자인 재검토 §B Important "별표 오노출").
 *
 * 최근/별표/앱 항목의 플라이아웃과 스페이스 개요 페이지는 후속(설계 §3 4~5단계) — 이번 패스에서는
 * 추천·스페이스만 실제 라우트로 이동하고 최근·별표·앱은 자리표시 항목이다.
 */
export function GlobalSidebar({ spaces, space, pages, reloadPages, onCreateSpace }: GlobalSidebarProps) {
  const navigate = useNavigate();
  const { width, setWidth } = useSidebarPrefs();
  const { starred } = useStarredSpaces();

  // 드래그 중 실시간 미리보기 폭 — pointermove마다 저장하지 않고 화면 표시만 갱신한다.
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

  // 페이지 트리 제목 검색 — 스페이스 전환 시 초기화한다.
  const [query, setQuery] = useState("");
  const spaceId = space?.id ?? null;
  useEffect(() => {
    setQuery("");
  }, [spaceId]);

  // 스페이스 플라이아웃(W6 T3) — 사이드바 헤더의 "현재 스페이스" 트리거 + 옆에 뜨는 전환 패널.
  const [spaceFlyoutOpen, setSpaceFlyoutOpen] = useState(false);
  const spaceSwitcherRef = useRef<HTMLDivElement>(null);
  const spaceTriggerRef = useRef<HTMLButtonElement>(null);
  const closeSpaceFlyout = useCallback(() => setSpaceFlyoutOpen(false), []);
  useDismissablePopover({
    containerRef: spaceSwitcherRef,
    triggerRef: spaceTriggerRef,
    open: spaceFlyoutOpen,
    onClose: closeSpaceFlyout,
  });

  // 콘텐츠 "+" 및 트리 행의 "+" — 공용 훅. 진입점마다 다르게 동작하면 어디서 만들었냐에 따라
  // 트리에 보였다 안 보였다 한다.
  const { createContent, creating } = useCreateContent(space?.id ?? null, reloadPages);

  const inSpace = space !== null;
  const searching = query.trim().length > 0;
  const visiblePages = pages === null ? null : filterPagesWithAncestors(pages, query);
  // 별표 스페이스 목록 — 홈·디렉토리 컨텍스트(space=null)에서만 렌더하므로 현재 스페이스 제외는 불필요.
  const starredSpaceList = spaces.filter((s) => starred.includes(s.id));

  // 글로벌 네비 항목의 활성 클래스 — NavLink(추천/스페이스)만 실제 라우트라 활성 하이라이트가 붙는다.
  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? "global-nav-item global-nav-item--active" : "global-nav-item";

  return (
    <aside className="wiki-sidebar" style={{ width: displayWidth }}>
      {/* 1단 — 글로벌 네비 (모든 화면 공통) */}
      <nav className="global-nav" aria-label="글로벌 탐색">
        <ul className="global-nav-list">
          <li>
            <NavLink to="/home" end className={navClass}>
              <House className="global-nav-icon" size={16} aria-hidden="true" />
              <span>추천</span>
            </NavLink>
          </li>
          {/* 최근/별표 표시/앱은 플라이아웃 후속(설계 §3 4단계) — 이번 패스는 자리표시 항목 */}
          <li>
            <button type="button" className="global-nav-item" disabled>
              <Clock className="global-nav-icon" size={16} aria-hidden="true" />
              <span>최근</span>
            </button>
          </li>
          <li>
            <button type="button" className="global-nav-item" disabled>
              <Star className="global-nav-icon" size={16} aria-hidden="true" />
              <span>별표 표시</span>
            </button>
          </li>
          <li>
            <NavLink to="/spaces" end className={navClass}>
              <Compass className="global-nav-icon" size={16} aria-hidden="true" />
              <span>스페이스</span>
            </NavLink>
          </li>
          <li>
            <button type="button" className="global-nav-item" disabled>
              <Grid3x3 className="global-nav-icon" size={16} aria-hidden="true" />
              <span>앱</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* 2단 — 컨텍스트 섹션 */}
      {inSpace ? (
        <>
          <div className="wiki-sidebar-header">
            <div className="space-switcher" ref={spaceSwitcherRef}>
              <Avatar
                className="space-switcher-avatar"
                name={space.name}
                color="auto"
                size="small"
              />
              <button
                ref={spaceTriggerRef}
                type="button"
                className="space-switcher-trigger"
                aria-haspopup="dialog"
                aria-expanded={spaceFlyoutOpen}
                aria-label={`스페이스 전환: ${space.name}`}
                onClick={() => setSpaceFlyoutOpen((prev) => !prev)}
              >
                {space.name} ({space.key})
              </button>
              {spaceFlyoutOpen && (
                <SpaceFlyout
                  spaces={spaces}
                  currentSpaceId={space.id}
                  onNavigate={(id) => {
                    setSpaceFlyoutOpen(false);
                    navigate(`/spaces/${id}`);
                  }}
                  onCreateClick={() => {
                    setSpaceFlyoutOpen(false);
                    onCreateSpace();
                  }}
                />
              )}
            </div>
          </div>
          <div className="wiki-sidebar-body">
            {/* 스페이스 컨텍스트는 순수 스페이스 스코프 — "콘텐츠"(페이지 트리)만. 별표 목록/디렉토리
             * 링크는 홈·디렉토리 컨텍스트로 이동(컨플루언스 스페이스 사이드바 충실 복제). */}
            <section className="wiki-sidebar-content" aria-label="콘텐츠">
              <div className="wiki-sidebar-content-head">
                <h3 className="wiki-sidebar-section-title">콘텐츠</h3>
                {/* 캡처(07-26-폴더.png)의 콘텐츠 헤더 "+" — 편집 화면을 먼저 띄우는 대신
                  * 초안 문서를 즉시 만들어 트리에 "초안" 배지와 함께 세운다(기획 P3).
                  * 폴더도 여기서 만들 수 있어야 한다 — 전에는 헤더 "만들기"로 나가야만 했다. */}
                <CreateContentMenu
                  trigger={
                    <button
                      type="button"
                      className="wiki-sidebar-content-add"
                      aria-label="콘텐츠 만들기"
                      title="콘텐츠 만들기"
                      disabled={creating}
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  }
                  onSelect={(type) => void createContent(type)}
                />
              </div>
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
                  spaceId={space.id}
                  pages={visiblePages}
                  forceExpand={searching}
                  onMoved={reloadPages}
                  onCreateChild={createContent}
                />
              )}
            </section>
          </div>
        </>
      ) : (
        // 홈·디렉토리 컨텍스트 — 별표 표시된 스페이스 목록 + 모든 스페이스 보기 (설계 §1.2)
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
                      {/* 스페이스 색 아이콘 선행 — 장식이라 접근 이름은 텍스트만(aria-hidden) */}
                      <Avatar name={s.name} color="auto" size="small" aria-hidden="true" />
                      <span className="wiki-sidebar-starred-name">
                        {s.name} ({s.key})
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Link to="/spaces" className="wiki-sidebar-all-spaces-link">
            모든 스페이스 보기
          </Link>
        </div>
      )}

      {/* 3단 — 푸터. Jira는 게이트웨이 뒤 alm 앱(별도 SPA base /alm/)이라 a 태그로 풀페이지 이동.
       * 팀·더 보기는 대상 앱이 아직 없어 후속 — 죽은 링크를 두지 않는다(디자인 재검토 접근성 지적). */}
      <div className="wiki-sidebar-footer">
        {/* 접근 이름에 앱 이동을 명시 — 아이콘(↗)은 장식이라 aria-hidden이라 텍스트만으론 크로스앱임이 안 드러남 */}
        <a className="wiki-sidebar-footer-link" href="/alm/" aria-label="Jira 앱으로 이동">
          <span>Jira</span>
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>

      <SidebarResizer width={displayWidth} onDrag={setDisplayWidth} onCommit={handleResizeCommit} />
    </aside>
  );
}
