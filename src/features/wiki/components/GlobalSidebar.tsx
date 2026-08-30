import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { Avatar, Dropdown, EmptyState, TextField, useToast } from "@chanho/react";
import { Archive, ChevronRight, Clock, ListChecks, UserRound, Compass, FileText, Folder, Grid3x3, House, MoreHorizontal, Newspaper, Plus, Settings, Star, Tag, Trash2 } from "lucide-react";
import type { PageNode, Space } from "../store/types";
import type { SpaceTree } from "../lib/useSpaceTree";
import { ensurePersonalSpace, listPagesByIds, listRecentPages, searchPageTitles } from "../store/wikiStore";
import { contentPathIn } from "../lib/contentPath";
import { PageTree } from "./PageTree";
import { TreeSkeleton } from "./WikiSkeleton";
import { useCreateContent } from "../lib/useCreateContent";
import { CreateContentMenu } from "./CreateContentMenu";
import { SidebarResizer } from "./SidebarResizer";
import { SpaceFlyout } from "./SpaceFlyout";
import { useSidebarPrefs } from "../lib/sidebarPrefs";
import { useStarredSpaces } from "../lib/starredSpaces";
import { hydrateStarredPages, useStarredPages } from "../lib/starredPages";
import { StarredFlyout } from "./StarredFlyout";
import { NavListFlyout, NAV_FLYOUT_LIMIT, type NavListFlyoutItem } from "./NavListFlyout";
import { getRecentVisits } from "../lib/recentVisits";
import { relativeTime } from "../lib/relativeTime";
import { getPage } from "../store/wikiStore";
import { useDismissablePopover } from "../lib/useDismissablePopover";

export interface GlobalSidebarProps {
  spaces: Space[];
  /** 현재 스페이스 — 스페이스 라우트면 해당 스페이스, 홈·디렉토리면 null */
  space: Space | null;
  /** 지연 로딩 트리 (AppShell이 소유) — 스페이스 밖이면 null */
  tree: SpaceTree | null;
  /** 페이지 이동·생성 후 트리 재로드 */
  reloadPages: () => Promise<void>;
  /** 스페이스 플라이아웃/컨텍스트 하단의 "스페이스 만들기" — AppShell의 공유 모달을 연다 */
  onCreateSpace: () => void;
  /** 개인 스페이스가 방금 만들어졌을 때 목록을 다시 읽는다(W23). */
  onSpacesChanged: () => void | Promise<void>;
}

/**
 * 컨플루언스 글로벌 셸의 좌측 사이드바 (설계 §1.2 — `2026-07-22-confluence-shell-design.md`).
 * 3단 구조: (1) 글로벌 네비(추천/최근/별표 표시/스페이스/앱, 모든 화면 공통) ·
 * (2) 컨텍스트 섹션(스페이스 안이면 스페이스 헤더 + "콘텐츠"(페이지 트리+검색)만 — 순수 스페이스
 * 스코프. 홈·디렉토리면 별표 스페이스 목록 + "모든 스페이스 보기").
 * AppShell이 접힘 상태에 따라 이 컴포넌트를 마운트/언마운트한다(접히면 aside 자체가 사라지는 기존
 * 동작 유지 — App.w5-sidebar 테스트 계약).
 *
 * 별표 스페이스 목록/디렉토리 링크는 컨플루언스처럼 홈·디렉토리 컨텍스트에만 둔다 — 스페이스
 * 사이드바에 노출하면 스코프가 섞인다(디자인 재검토 §B Important "별표 오노출").
 *
 * 최근/별표/앱 항목의 플라이아웃과 스페이스 개요 페이지는 후속(설계 §3 4~5단계) — 이번 패스에서는
 * 추천·스페이스만 실제 라우트로 이동하고 최근·별표·앱은 자리표시 항목이다.
 */
/** 이모지가 있으면 그것을, 없으면 타입 아이콘을 — 트리와 같은 규칙이다. */
function iconFor(icon: string | null | undefined, type: "page" | "folder" | "blog") {
  if (icon) {
    return (
      <span className="page-tree-emoji" aria-hidden="true">
        {icon}
      </span>
    );
  }
  return type === "folder" ? (
    <Folder size={14} aria-hidden="true" />
  ) : (
    <FileText size={14} aria-hidden="true" />
  );
}

export function GlobalSidebar({ spaces, space, tree, reloadPages, onCreateSpace, onSpacesChanged }: GlobalSidebarProps) {
  /**
   * 내 스페이스(W23) — 없으면 그 자리에서 만든다. 별도 "만들기" 단계를 두지 않는 이유: 개인
   * 스페이스는 한 사람에 하나이고 이름·키가 정해져 있어 물어볼 것이 없다.
   */
  const [openingPersonal, setOpeningPersonal] = useState(false);
  const openPersonal = async () => {
    if (openingPersonal) return;
    setOpeningPersonal(true);
    try {
      const mine = await ensurePersonalSpace();
      if (!spaces.some((s) => s.id === mine.id)) await onSpacesChanged();
      navigate(`/spaces/${mine.id}`);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setOpeningPersonal(false);
    }
  };
  const navigate = useNavigate();
  const toast = useToast();
  const { width, setWidth } = useSidebarPrefs();
  const { starred } = useStarredSpaces();
  const { entries: starredPageEntries } = useStarredPages();
  // "별표 표시" — 검색형 플라이아웃(컨플루언스 참조: 펼침 목록이 아니라 검색해서 찾는다)
  const [starOpen, setStarOpen] = useState(false);
  const starContainerRef = useRef<HTMLLIElement>(null);
  const starTriggerRef = useRef<HTMLButtonElement>(null);
  const closeStarFlyout = useCallback(() => setStarOpen(false), []);
  useDismissablePopover({
    containerRef: starContainerRef,
    triggerRef: starTriggerRef,
    open: starOpen,
    onClose: closeStarFlyout,
  });

  // "최근" — 방문 로그(id만 저장된다)를 열 때 하이드레이트한다. 사이드바가 매번 들고 있을 이유가 없다.
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentItems, setRecentItems] = useState<NavListFlyoutItem[] | null>(null);
  const recentContainerRef = useRef<HTMLLIElement>(null);
  const recentTriggerRef = useRef<HTMLButtonElement>(null);
  const closeRecentFlyout = useCallback(() => setRecentOpen(false), []);
  useDismissablePopover({
    containerRef: recentContainerRef,
    triggerRef: recentTriggerRef,
    open: recentOpen,
    onClose: closeRecentFlyout,
  });

  useEffect(() => {
    if (!recentOpen) return;
    let cancelled = false;
    setRecentItems(null);
    void (async () => {
      /*
       * 서버 기록이 먼저다(W23) — 기기를 옮겨도 이어지고, 권한이 회수된 문서는 서버가 걸러 준다.
       * null이면 서버 원장이 없는 모드(목업)라 브라우저 기록으로 되돌아간다.
       */
      const fromServer = await listRecentPages(NAV_FLYOUT_LIMIT).catch(() => null);
      if (cancelled) return;
      if (fromServer !== null) {
        setRecentItems(fromServer.map((row) => ({
          key: row.id,
          icon: iconFor(row.icon, row.type),
          label: row.title,
          meta: row.spaceName ?? undefined,
          path: contentPathIn(row.spaceId, { id: row.id, type: row.type }),
        })));
        return;
      }

      const visits = getRecentVisits(NAV_FLYOUT_LIMIT);
      // 지워진 페이지는 null로 떨어뜨린다 — 방문 로그가 죽은 링크를 남기지 않게 한다.
      const pages = await Promise.all(visits.map((v) => getPage(v.id).catch(() => null)));
      if (cancelled) return;
      setRecentItems(
        visits.flatMap((visit, i) => {
          const page = pages[i];
          if (!page) return [];
          return [{
            key: page.id,
            icon: iconFor(page.icon, page.type),
            label: page.title,
            meta: relativeTime(visit.at),
            path: contentPathIn(page.spaceId, page),
          }];
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [recentOpen]);

  // "스페이스" — 목록은 이미 손에 있다(props). 열자마자 그린다.
  const [spacesOpen, setSpacesOpen] = useState(false);
  const spacesContainerRef = useRef<HTMLLIElement>(null);
  const spacesTriggerRef = useRef<HTMLButtonElement>(null);
  const closeSpacesFlyout = useCallback(() => setSpacesOpen(false), []);
  useDismissablePopover({
    containerRef: spacesContainerRef,
    triggerRef: spacesTriggerRef,
    open: spacesOpen,
    onClose: closeSpacesFlyout,
  });

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
  /**
   * 별표 스냅샷 최신화 — 개명·이모지 변경을 반영하고 구버전(제목 없는) 엔트리를 채운다.
   * 지연 트리에서는 별표된 문서가 트리에 로드돼 있으리라는 보장이 없어, **별표된 id만** 서버에
   * 물어본다(2026-08-29). 로드된 노드만으로 맞추면 접힌 가지의 별표 제목이 조용히 낡는다.
   * 다른 스페이스의 별표는 건드리지 않는다.
   */
  const starredIdsKey = starredPageEntries
    .filter((e) => e.spaceId === spaceId || e.spaceId === undefined)
    .map((e) => e.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (spaceId === null || starredIdsKey.length === 0) return;
    let cancelled = false;
    void listPagesByIds(spaceId, starredIdsKey.split(","))
      .then((found) => {
        if (!cancelled && found.length > 0) hydrateStarredPages(spaceId, found);
      })
      .catch(() => {
        // 스냅샷 최신화 실패는 표시만 낡을 뿐이라 조용히 넘긴다
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId, starredIdsKey]);
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
  const { createContent, createFromTemplate, creating } = useCreateContent(space?.id ?? null, reloadPages);

  const inSpace = space !== null;
  const searching = query.trim().length > 0;
  /**
   * 제목 검색은 서버가 한다(2026-08-29). 예전에는 화면이 들고 있던 전 페이지를 걸렀다.
   * 결과는 계층 없이 평면 목록으로 보여준다 — 매치마다 조상 체인을 따로 받아오면
   * 한 번 타이핑에 요청이 수십 개가 된다.
   */
  const [results, setResults] = useState<PageNode[] | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (!space || q.length === 0) {
      setResults(null);
      return;
    }
    let cancelled = false;
    // 타이핑마다 때리지 않도록 잠깐 기다린다.
    const timer = setTimeout(() => {
      void searchPageTitles(space.id, q)
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, space]);
  // 별표 스페이스 목록 — 홈·디렉토리 컨텍스트(space=null)에서만 렌더하므로 현재 스페이스 제외는 불필요.
  const starredSpaceList = spaces.filter((s) => starred.includes(s.id));
  // 주의: 페이지 별표는 여기서 prune하지 않는다 — 이 컴포넌트는 현재 스페이스의 페이지만
  // 알아서, 그 기준으로 지우면 다른 스페이스의 별표가 날아간다(스페이스 별표 prune과 다른 점).
  // 죽은 페이지 별표는 페이지 삭제 경로(PageViewPage)에서 개별 제거한다.

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
          {/* 앱은 플라이아웃 후속(설계 §3 4단계) — 이번 패스는 자리표시 항목 */}
          <li ref={recentContainerRef} className="global-nav-star-anchor">
            <button
              ref={recentTriggerRef}
              type="button"
              className="global-nav-item"
              aria-haspopup="dialog"
              aria-expanded={recentOpen}
              onClick={() => setRecentOpen((v) => !v)}
            >
              <Clock className="global-nav-icon" size={16} aria-hidden="true" />
              <span>최근</span>
              <ChevronRight className="global-nav-caret" size={14} aria-hidden="true" />
            </button>
            {recentOpen ? (
              <NavListFlyout
                label="최근"
                items={recentItems ?? []}
                loading={recentItems === null}
                emptyText="최근에 본 문서가 없습니다"
                morePath="/home"
                moreLabel="전체 보기"
                onClose={closeRecentFlyout}
                onNavigate={(path) => {
                  setRecentOpen(false);
                  navigate(path);
                }}
              />
            ) : null}
          </li>
          <li ref={starContainerRef} className="global-nav-star-anchor">
            <button
              ref={starTriggerRef}
              type="button"
              className="global-nav-item"
              aria-haspopup="dialog"
              aria-expanded={starOpen}
              onClick={() => setStarOpen((v) => !v)}
            >
              <Star className="global-nav-icon" size={16} aria-hidden="true" />
              <span>별표 표시</span>
              <ChevronRight className="global-nav-caret" size={14} aria-hidden="true" />
            </button>
            {starOpen ? (
              <StarredFlyout
                spaces={spaces}
                starredSpaceIds={starred}
                starredPages={starredPageEntries}
                onNavigate={(path) => {
                  setStarOpen(false);
                  navigate(path);
                }}
              />
            ) : null}
          </li>
          <li ref={spacesContainerRef} className="global-nav-star-anchor">
            <button
              ref={spacesTriggerRef}
              type="button"
              className="global-nav-item"
              aria-haspopup="dialog"
              aria-expanded={spacesOpen}
              onClick={() => setSpacesOpen((v) => !v)}
            >
              <Compass className="global-nav-icon" size={16} aria-hidden="true" />
              <span>스페이스</span>
              <ChevronRight className="global-nav-caret" size={14} aria-hidden="true" />
            </button>
            {spacesOpen ? (
              <NavListFlyout
                label="스페이스"
                items={spaces.map((s) => ({
                  key: s.id,
                  icon: <Compass size={14} aria-hidden="true" />,
                  label: s.name,
                  meta: s.key,
                  path: `/spaces/${s.id}`,
                }))}
                emptyText="스페이스가 없습니다"
                morePath="/spaces"
                moreLabel="전체 보기"
                onClose={closeSpacesFlyout}
                onNavigate={(path) => {
                  setSpacesOpen(false);
                  navigate(path);
                }}
              />
            ) : null}
          </li>
          <li>
            <button
              type="button"
              className="global-nav-item"
              disabled={openingPersonal}
              onClick={() => void openPersonal()}
            >
              <UserRound className="global-nav-icon" size={16} aria-hidden="true" />
              <span>내 스페이스</span>
            </button>
          </li>
          <li>
            <NavLink to="/tasks" end className={navClass}>
              <ListChecks className="global-nav-icon" size={16} aria-hidden="true" />
              <span>내 작업</span>
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
              {/*
                이름에 마우스를 올리면 나타나는 "…" — 스페이스 단위 동작이 사는 자리다.
                이름 버튼 자체는 스페이스 전환이라, 설정을 같은 버튼에 얹을 수 없다.
              */}
              <Dropdown
                trigger={
                  <button
                    type="button"
                    className="space-switcher-more"
                    aria-label={`${space.name} 스페이스 메뉴`}
                    title="스페이스 메뉴"
                  >
                    <MoreHorizontal size={16} aria-hidden="true" />
                  </button>
                }
                items={[
                  {
                    label: "스페이스 설정",
                    icon: <Settings size={16} aria-hidden="true" />,
                    onSelect: () => navigate(`/spaces/${space.id}/settings`),
                  },
                  {
                    label: "블로그",
                    icon: <Newspaper size={16} aria-hidden="true" />,
                    onSelect: () => navigate(`/spaces/${space.id}/blog`),
                  },
                  {
                    label: "라벨",
                    icon: <Tag size={16} aria-hidden="true" />,
                    onSelect: () => navigate(`/spaces/${space.id}/labels`),
                  },
                  {
                    label: "보관함",
                    icon: <Archive size={16} aria-hidden="true" />,
                    onSelect: () => navigate(`/spaces/${space.id}/archive`),
                  },
                  {
                    label: "휴지통",
                    icon: <Trash2 size={16} aria-hidden="true" />,
                    onSelect: () => navigate(`/spaces/${space.id}/trash`),
                  },
                ]}
              />
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
                  spaceId={space.id}
                  onSelectTemplate={(template) => void createFromTemplate(template)}
                />
              </div>
              <TextField
                label="페이지 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목으로 검색"
              />
              {searching ? (
                results === null ? (
                  <TreeSkeleton label="검색 중" />
                ) : results.length === 0 ? (
                  <EmptyState title="검색 결과 없음" description="다른 검색어를 입력해 보세요." />
                ) : (
                  <nav aria-label="페이지 검색 결과">
                    <ul className="page-tree-list">
                      {results.map((page) => (
                        <li key={page.id}>
                          <NavLink
                            to={contentPathIn(space.id, page)}
                            className="page-tree-link"
                          >
                            {page.icon ? (
                              <span className="page-tree-emoji" aria-hidden="true">{page.icon}</span>
                            ) : page.type === "folder" ? (
                              <Folder className="page-tree-icon" size={16} aria-hidden="true" />
                            ) : (
                              <FileText className="page-tree-icon" size={16} aria-hidden="true" />
                            )}
                            <span className="page-tree-label">{page.title}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )
              ) : tree === null || (tree.loading && tree.nodes.length === 0) ? (
                <TreeSkeleton label="페이지 트리 로딩 중" />
              ) : (
                <PageTree
                  spaceId={space.id}
                  pages={tree.nodes}
                  expanded={tree.expanded}
                  onToggle={tree.toggle}
                  spaces={spaces}
                  onMoved={reloadPages}
                  onCreateChild={createContent}
                />
              )}
            </section>
            {/* 라벨·휴지통은 자주 쓰는 탐색이라 사이드바에 남긴다 — 설정은 이름 옆 "…" 메뉴로
              * 옮겼다(진입점이 둘이면 어디가 정본인지 알 수 없다). */}
            {/* 블로그(W24)는 트리에 없어서 이 링크가 유일한 입구다 */}
            <NavLink to={`/spaces/${space.id}/blog`} className={navClass}>
              <Newspaper className="global-nav-icon" size={16} aria-hidden="true" />
              <span>블로그</span>
            </NavLink>
            <NavLink to={`/spaces/${space.id}/labels`} className={navClass}>
              <Tag className="global-nav-icon" size={16} aria-hidden="true" />
              <span>라벨</span>
            </NavLink>
            <NavLink to={`/spaces/${space.id}/archive`} className={navClass}>
              <Archive className="global-nav-icon" size={16} aria-hidden="true" />
              <span>보관함</span>
            </NavLink>
            <NavLink to={`/spaces/${space.id}/trash`} className={navClass}>
              <Trash2 className="global-nav-icon" size={16} aria-hidden="true" />
              <span>휴지통</span>
            </NavLink>
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

      {/* 푸터의 Jira 크로스앱 링크는 제거했다(2026-08-23 피드백) — 위키 셸에서 타 앱 이동은
       * 글로벌 네비 "앱" 항목이 담당할 예정이라 중복 진입점을 두지 않는다. */}
      <SidebarResizer width={displayWidth} onDrag={setDisplayWidth} onCommit={handleResizeCommit} />
    </aside>
  );
}
