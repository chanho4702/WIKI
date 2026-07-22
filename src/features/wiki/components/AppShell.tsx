import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate, useParams } from "react-router";
import { Button, Dropdown } from "@chanho/react";
import { FileText, FolderPlus, Plus } from "lucide-react";
import type { Page, Space } from "../store/types";
import { listPages } from "../store/wikiStore";
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
  const { collapsed, setCollapsed } = useSidebarPrefs();

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

  const reloadPages = useCallback(async () => {
    if (!currentId) return;
    setPages(await listPages(currentId));
  }, [currentId]);

  // 존재하지 않는 스페이스 ID로 접근하면(스페이스 라우트인데 매칭 실패) 첫 스페이스로 돌린다.
  // 홈(/home)·디렉토리(/spaces)는 spaceId가 없으므로 여기에 해당하지 않는다.
  if (spaceId !== undefined && space === null) {
    return <Navigate to={`/spaces/${spaces[0].id}`} replace />;
  }

  // 헤더 "만들기" — 스페이스 안이면 새 페이지/새 스페이스 드롭다운, 밖(홈·디렉토리)이면 새 스페이스 버튼.
  const createControl = space ? (
    <Dropdown
      trigger={
        <Button size="small" iconBefore={<Plus size={16} aria-hidden="true" />}>
          만들기
        </Button>
      }
      items={[
        {
          label: "새 페이지",
          icon: <FileText size={16} aria-hidden="true" />,
          onSelect: () => navigate(`/spaces/${space.id}/pages/new`),
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
        <main className="wiki-content">
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
