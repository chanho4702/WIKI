import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { Button } from "@chanho/react";
import { FolderPlus, MapPin, Plus } from "lucide-react";
import type { Space } from "../store/types";
import { GlobalSidebar } from "./GlobalSidebar";
import { syncStarsFromServer } from "../lib/starSync";
import { SpaceSettingsSidebar } from "./SpaceSettingsSidebar";
import { SpaceCreateModal } from "./SpaceCreateModal";
import { WikiTopBar } from "./WikiTopBar";
import type { WikiOutletContext } from "./wikiContext";
import { useSidebarPrefs } from "../lib/sidebarPrefs";
import { pruneStarredSpaces } from "../lib/starredSpaces";
import { useCreateContent } from "../lib/useCreateContent";
import { useSpaceTree } from "../lib/useSpaceTree";
import { CreateContentMenu } from "./CreateContentMenu";
import { CreateContentDialog } from "./CreateContentDialog";

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
  const mainRef = useRef<HTMLElement>(null);

  // spaceId가 있는 라우트(/spaces/:spaceId/*)에서만 현재 스페이스를 특정한다. 홈·디렉토리는 null.
  const space = spaceId ? spaces.find((s) => s.id === spaceId) ?? null : null;
  const inSettings =
    spaceId !== undefined && pathname.startsWith(`/spaces/${spaceId}/settings`);
  const currentId = space?.id ?? null;

  /**
   * 지연 로딩 트리(2026-08-29) — 예전에는 스페이스에 들어가는 순간 전 페이지를 받았다.
   * 이제 최상위만 받고 펼칠 때 한 단계씩 받는다.
   */
  const tree = useSpaceTree(currentId);
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);

  // 별표는 서버가 원장이다 — 앱이 뜰 때 한 번 맞춘다(W23). 실패해도 브라우저 사본으로 계속 돈다.
  useEffect(() => {
    void syncStarsFromServer();
  }, []);

  // 스페이스 목록이 로드/갱신될 때마다 별표 저장 배열에서 죽은 id를 정리한다(스페이스 삭제 등).
  useEffect(() => {
    pruneStarredSpaces(spaces.map((s) => s.id));
  }, [spaces]);

  // 깊은 링크로 들어오면 그 문서가 트리에 보이도록 조상 체인을 펼친다.
  // (트리 전체를 받지 않으므로 펼쳐 주지 않으면 현재 위치가 사이드바에 나타나지 않는다.)
  const revealTree = tree.reveal;
  useEffect(() => {
    const match = /^\/spaces\/[^/]+\/(?:pages|folder)\/([^/]+)/.exec(pathname);
    const pageId = match?.[1];
    if (!pageId || pageId === "new") return;
    void revealTree(pageId);
  }, [pathname, revealTree]);

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

  const refreshTree = tree.refresh;
  const reloadPages = useCallback(async () => {
    await refreshTree();
  }, [refreshTree]);

  // 페이지·폴더 생성은 useCreateContent 하나로 모았다 — 전에는 폴더 생성이 여기와 FolderPage에
  // 따로 복제돼 있었고, 그 탓에 헤더에서는 하위 폴더를 만들 방법이 아예 없었다(parentId 미지원).
  const { createContent, createFromTemplate } = useCreateContent(space?.id ?? null, reloadPages);

  // 위치 지정 만들기 다이얼로그 — 헤더 "만들기"의 상세 경로. null = 닫힘, 값 = 기본 타입.
  const [createDialogType, setCreateDialogType] = useState<"page" | "folder" | null>(null);

  // 존재하지 않는 스페이스 ID로 접근하면(스페이스 라우트인데 매칭 실패) 첫 스페이스로 돌린다.
  // 홈(/home)·디렉토리(/spaces)는 spaceId가 없으므로 여기에 해당하지 않는다.
  if (spaceId !== undefined && space === null) {
    return <Navigate to={`/spaces/${spaces[0].id}`} replace />;
  }

  // 헤더 "만들기" — 스페이스 안이면 페이지/폴더/새 스페이스 드롭다운, 밖(홈·디렉토리)이면 새 스페이스 버튼.
  const createControl = space ? (
    <CreateContentMenu
      trigger={
        <Button size="small" iconBefore={<Plus size={16} aria-hidden="true" />}>
          만들기
        </Button>
      }
      onSelect={(type) => void createContent(type)}
      spaceId={space.id}
      onSelectTemplate={(template) => void createFromTemplate(template)}
      extraItems={[
        {
          label: "위치 지정해 만들기…",
          icon: <MapPin size={16} aria-hidden="true" />,
          onSelect: () => setCreateDialogType("page"),
        },
        {
          label: "새 스페이스",
          icon: <FolderPlus size={16} aria-hidden="true" />,
          onSelect: () => setSpaceModalOpen(true),
        },
      ]}
    />
  ) : (
    // 스페이스 밖(홈·디렉토리) — 직접 생성할 스페이스 컨텍스트가 없으므로 페이지/폴더는
    // 위치 지정 다이얼로그로 연다(타입 미리 선택). 전에는 새 스페이스만 가능했다.
    <CreateContentMenu
      trigger={
        <Button size="small" iconBefore={<Plus size={16} aria-hidden="true" />}>
          만들기
        </Button>
      }
      onSelect={(type) => setCreateDialogType(type)}
      extraItems={[
        {
          label: "새 스페이스",
          icon: <FolderPlus size={16} aria-hidden="true" />,
          onSelect: () => setSpaceModalOpen(true),
        },
      ]}
    />
  );

  // 홈·디렉토리 라우트도 이 컨텍스트를 받지만 space를 읽지 않는다(스페이스 페이지 화면만 읽는다).
  // 스페이스 라우트에서는 위 리다이렉트로 space가 non-null임이 보장되므로 캐스트가 안전하다.
  const outletContext: WikiOutletContext = { space: space as Space, reloadPages };

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
        {collapsed ? null : inSettings && space ? (
          /* 설정은 페이지 트리와 함께 볼 이유가 없는 별도 화면이다 — 사이드바째 바꾼다 */
          <SpaceSettingsSidebar space={space} />
        ) : (
          <GlobalSidebar
            spaces={spaces}
            space={space}
            tree={space ? tree : null}
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
      <CreateContentDialog
        open={createDialogType !== null}
        onOpenChange={(open) => {
          if (!open) setCreateDialogType(null);
        }}
        spaces={spaces}
        defaultSpaceId={space?.id ?? null}
        defaultType={createDialogType ?? "page"}
        reloadPages={reloadPages}
      />
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
