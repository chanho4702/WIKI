import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { Button, Dropdown, useToast } from "@chanho/react";
import { FileText, Folder, FolderPlus, Plus } from "lucide-react";
import type { Page, Space } from "../store/types";
import { createPage, listPages } from "../store/wikiStore";
import { GlobalSidebar } from "./GlobalSidebar";
import { SpaceCreateModal } from "./SpaceCreateModal";
import { WikiTopBar } from "./WikiTopBar";
import type { WikiOutletContext } from "./wikiContext";
import { useSidebarPrefs } from "../lib/sidebarPrefs";
import { pruneStarredSpaces } from "../lib/starredSpaces";

export interface AppShellProps {
  spaces: Space[];
  /** 스페이스 목록이 바뀌었을 때(생성 등) App이 다시 로드하도록 알린다 */
  onSpacesChanged: () => void | Promise<void>;
}

/**
 * 컨플루언스 글로벌 셸 (설계 §2 — `2026-07-22-confluence-shell-design.md`). 모든 라우트를 감싸
 * 헤더(WikiTopBar, 사이드바 토글 상시)·좌측 GlobalSidebar(접힘 가능)·본문 Outlet을 하나의 셸로
 * 통일한다. 이전엔 스페이스 라우트만 WikiLayout 사이드바를 가져 홈·디렉토리에서 토글이 사라지고
 * 사이드바 구성이 달라졌던 문제를 해소한다.
 *
 * 스페이스 라우트에서는 이 셸이 직접 페이지 트리를 로드해 GlobalSidebar와 하위 페이지 화면
 * (PageView/Edit/Index)에 같은 WikiOutletContext를 공급한다 — 셸(사이드바)과 라우트(본문)가 한
 * 데이터를 공유해야 트리·본문이 어긋나지 않는다.
 */
export function AppShell({ spaces, onSpacesChanged }: AppShellProps) {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { collapsed, setCollapsed } = useSidebarPrefs();
  const toast = useToast();
  const mainRef = useRef<HTMLElement>(null);

  // spaceId가 있는 라우트(/spaces/:spaceId/*)에서만 현재 스페이스를 특정한다. 홈·디렉토리는 null.
  const space = spaceId ? spaces.find((s) => s.id === spaceId) ?? null : null;
  const currentId = space?.id ?? null;

  const [pages, setPages] = useState<Page[] | null>(null);
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);

  // 스페이스 목록이 로드/갱신될 때마다 별표 저장 배열에서 죽은 id를 정리한다(스페이스 삭제 등).
  useEffect(() => {
    pruneStarredSpaces(spaces.map((s) => s.id));
  }, [spaces]);

  useEffect(() => {
    if (!currentId) {
      setPages(null);
      return;
    }
    setPages(null);
    void listPages(currentId).then(setPages);
  }, [currentId]);

  /**
   * 라우트 전환 시 본문 스크롤을 맨 위로 되돌린다. 뷰포트가 아니라 `.wiki-content`가 스크롤
   * 컨테이너이므로 브라우저의 기본 스크롤 복원도, react-router의 ScrollRestoration(window
   * 기준)도 동작하지 않는다 — 긴 페이지를 읽다 다른 페이지로 넘어가면 새 페이지가 중간부터
   * 보였다.
   *
   * 여기서 포커스는 옮기지 않는다. SPA 전환을 스크린리더에 알리려면 본문으로 포커스를 옮기는
   * 방법이 흔하지만, 이 앱에서는 pathname 변경이 사용자 조작 없이도 일어난다(`/` → 첫 스페이스
   * → 첫 페이지 리다이렉트, 스페이스 삭제 후 이동 등). 그때 포커스를 가져가면 사용자가 방금
   * 누른 컨트롤(사이드바 토글·리사이저)에서 포커스가 빠져나가 "포커스를 빼앗지 않는다"는 기존
   * 계약(App.w5-sidebar / App.w6-spaces 테스트)을 깬다. 키보드 사용자의 본문 진입 경로는
   * 스킵 링크(.wiki-skip-link)가 담당한다.
   */
  useEffect(() => {
    const el = mainRef.current;
    if (el) el.scrollTop = 0;
  }, [pathname]);

  const reloadPages = useCallback(async () => {
    if (!currentId) return;
    setPages(await listPages(currentId));
  }, [currentId]);

  /**
   * 폴더 만들기 — 페이지와 달리 편집 화면을 거치지 않는다. 폴더는 본문이 없어 입력받을 게
   * 이름뿐이고, 그 이름은 폴더 화면에서 인라인으로 고치는 게 캡처(`07-26-폴더2.png`)의 흐름이다.
   * 그래서 임시 이름으로 즉시 만들고 폴더 화면으로 보낸다.
   *
   * 아래 Navigate 조기 반환보다 위에 둔다 — 훅은 렌더 경로에 따라 건너뛸 수 없다.
   */
  const createFolder = useCallback(async () => {
    if (!space) return;
    try {
      const created = await createPage({
        spaceId: space.id,
        title: "제목 없는 폴더",
        type: "folder",
      });
      await reloadPages();
      navigate(`/spaces/${space.id}/folder/${created.id}`);
    } catch (error) {
      toast({
        title: "폴더 만들기 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  }, [space, navigate, toast, reloadPages]);

  // 존재하지 않는 스페이스 ID로 접근하면(스페이스 라우트인데 매칭 실패) 첫 스페이스로 돌린다.
  // 홈(/home)·디렉토리(/spaces)는 spaceId가 없으므로 여기에 해당하지 않는다.
  if (spaceId !== undefined && space === null) {
    return <Navigate to={`/spaces/${spaces[0].id}`} replace />;
  }

  // 헤더 "만들기" — 스페이스 안이면 페이지/폴더/새 스페이스 드롭다운, 밖(홈·디렉토리)이면 새 스페이스 버튼.
  const createControl = space ? (
    <Dropdown
      trigger={
        <Button size="small" iconBefore={<Plus size={16} aria-hidden="true" />}>
          만들기
        </Button>
      }
      items={[
        {
          label: "페이지",
          icon: <FileText size={16} aria-hidden="true" />,
          onSelect: () => navigate(`/spaces/${space.id}/pages/new`),
        },
        {
          label: "폴더",
          icon: <Folder size={16} aria-hidden="true" />,
          onSelect: () => void createFolder(),
        },
        {
          label: "새 스페이스",
          icon: <FolderPlus size={16} aria-hidden="true" />,
          onSelect: () => setSpaceModalOpen(true),
        },
      ]}
    />
  ) : (
    <Button
      size="small"
      iconBefore={<Plus size={16} aria-hidden="true" />}
      onClick={() => setSpaceModalOpen(true)}
    >
      만들기
    </Button>
  );

  // 홈·디렉토리 라우트도 이 컨텍스트를 받지만 space를 읽지 않는다(스페이스 페이지 화면만 읽는다).
  // 스페이스 라우트에서는 위 리다이렉트로 space가 non-null임이 보장되므로 캐스트가 안전하다.
  const outletContext: WikiOutletContext = { pages, space: space as Space, reloadPages };

  return (
    <div className="wiki-layout">
      {/* WCAG 2.4.1 — 사이드바의 글로벌 네비 + 페이지 트리(수십 항목)를 Tab으로 전부 지나지 않고
        * 본문으로 바로 가는 경로. 포커스를 받을 때만 화면에 나타난다(.wiki-skip-link). */}
      <a className="wiki-skip-link" href="#wiki-main">
        본문으로 건너뛰기
      </a>
      <WikiTopBar
        onSidebarToggle={() => setCollapsed(!collapsed)}
        sidebarExpanded={!collapsed}
        create={createControl}
      />
      <div className="wiki-body">
        {collapsed ? null : (
          <GlobalSidebar
            spaces={spaces}
            space={space}
            pages={pages}
            reloadPages={reloadPages}
            onCreateSpace={() => setSpaceModalOpen(true)}
          />
        )}
        {/* tabIndex={-1}: 스킵 링크(#wiki-main)의 앵커 점프가 포커스까지 옮기려면 대상이
          * 포커스 가능해야 한다. -1이라 Tab 순서에는 들어가지 않는다. */}
        <main className="wiki-content" id="wiki-main" ref={mainRef} tabIndex={-1}>
          <Outlet context={outletContext} />
        </main>
      </div>
      {/* 스페이스 생성 모달 — 헤더 "만들기"와 스페이스 플라이아웃이 공유하는 단일 인스턴스 */}
      <SpaceCreateModal
        showTrigger={false}
        open={spaceModalOpen}
        onOpenChange={setSpaceModalOpen}
        onCreated={async (created) => {
          await onSpacesChanged();
          navigate(`/spaces/${created.id}`);
        }}
      />
    </div>
  );
}
