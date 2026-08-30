import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Avatar, Button, Dropdown, TopBar } from "@chanho/react";
import { Database, PanelLeft, Settings, Users } from "lucide-react";
import type { User } from "../store/types";
import { getCurrentUser, getSearchIndexStatus } from "../store/wikiStore";
import { useTheme } from "../../../app/theme";
import { useAuth } from "../../../auth/AuthGate";
import { GlobalSearchField } from "./GlobalSearchField";
import { ShortcutHelpModal } from "./ShortcutHelpModal";
import { NotificationBell } from "./NotificationBell";

export interface WikiTopBarProps {
  /** 지정하면 브랜드 슬롯 좌측에 사이드바 토글 버튼을 렌더한다(WikiLayout 전용 — 사이드바가 있는
   * 화면에서만 의미가 있다). 미지정 시 토글 버튼 없이 브랜드만 보인다(SpaceDirectoryPage처럼
   * 사이드바가 없는 화면). */
  onSidebarToggle?: () => void;
  /** 토글 버튼의 aria-expanded 값 — onSidebarToggle을 넘길 때 함께 넘긴다. */
  sidebarExpanded?: boolean;
  /** 헤더 중앙 검색 인풋 오른쪽에 놓이는 "만들기" 컨트롤(선택). */
  create?: ReactNode;
}

/**
 * 상단 고정 바(TopBar) — 원래 WikiLayout에 인라인으로 있던 브랜드/사이드바 토글(W7 T6)/
 * 다크모드 스위치/로그아웃/아바타를 그대로 옮긴 것 (W7 T7). SpaceDirectoryPage처럼 사이드바가
 * 없는 화면에서도 재사용하기 위해 onSidebarToggle을 선택적으로 받는다 — 계약: WikiLayout의
 * 동작은 이 추출 전후로 무변경이다.
 */
export function WikiTopBar({ onSidebarToggle, sidebarExpanded, create }: WikiTopBarProps) {
  const { theme, toggle } = useTheme();
  const { user: authUser, logout } = useAuth();
  const [me, setMe] = useState<User | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const navigate = useNavigate();
  /*
   * 전역 관리자에게만 색인 관리 항목을 띄운다.
   *
   * 판단 근거는 org-service의 GLOBAL ADMIN grant다 — Keycloak realm role과는 다른 개념이라
   * 토큰의 roles로 대신할 수 없다. 그래서 권위 있는 곳에 직접 물어본다: 현황 조회가 통하면
   * 관리자다. 상단바는 앱당 한 번 마운트되므로 세션당 요청 하나로 끝난다.
   */
  const [canManageSearch, setCanManageSearch] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getSearchIndexStatus()
      .then((status) => {
        if (!cancelled) setCanManageSearch(status !== null);
      })
      .catch(() => {
        if (!cancelled) setCanManageSearch(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void getCurrentUser().then(setMe);
  }, []);

  return (
    <TopBar
      searchTrailing={
        <>
          <GlobalSearchField />
          {create}
        </>
      }
      brand={
        <>
          {onSidebarToggle ? (
            <Button
              variant="ghost"
              size="small"
              className="wiki-sidebar-toggle"
              aria-label="사이드바 토글"
              aria-expanded={!!sidebarExpanded}
              onClick={onSidebarToggle}
            >
              <PanelLeft size={16} aria-hidden="true" />
            </Button>
          ) : null}
          <Link to="/home" className="wiki-brand">
            WIKI
          </Link>
        </>
      }
      actions={
        <>
          {/* 알림 — 미읽음 배지 + 알림함 팝오버(멘션/관심 페이지 업데이트/댓글) */}
          <NotificationBell />
          {/* 설정 — 드롭다운 골격. 하위 항목은 결정 대기 상태라 자리만 잡아 둔다 */}
          <Dropdown
            trigger={
              <Button size="small" variant="ghost" iconOnly aria-label="설정" title="설정">
                <Settings size={16} aria-hidden="true" />
              </Button>
            }
            items={[
              {
                label: theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환",
                onSelect: toggle,
              },
              { label: "단축키 도움말", onSelect: () => setShortcutHelpOpen(true) },
              // 전역 관리자에게만 보인다 — 아닌 사람에게 띄우면 눌러도 "권한 없음"만 나온다
              // 두 항목 모두 전역 관리자용이라 같은 게이트를 쓴다 — 팀 쓰기는 org-service가 GLOBAL ADMIN을 요구한다
              ...(canManageSearch
                ? [
                    {
                      label: "팀 관리",
                      icon: <Users size={16} aria-hidden="true" />,
                      onSelect: () => navigate("/admin/teams"),
                    },
                    {
                      label: "검색 색인 관리",
                      icon: <Database size={16} aria-hidden="true" />,
                      onSelect: () => navigate("/admin/search"),
                    },
                  ]
                : []),
            ]}
          />
          <ShortcutHelpModal open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />
          {/* 사용자 — 아바타 드롭다운(이름·로그아웃) */}
          {me ? (
            <Dropdown
              trigger={
                <button type="button" className="wiki-user-menu-trigger" aria-label="사용자 메뉴">
                  <Avatar name={me.name} size="small" />
                </button>
              }
              items={[
                { label: authUser?.name ?? authUser?.email ?? me.name, onSelect: () => {} },
                ...(authUser ? [{ label: "로그아웃", onSelect: () => void logout() }] : []),
              ]}
            />
          ) : null}
        </>
      }
    />
  );
}
