import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Avatar, Button, Dropdown, TopBar, useToast } from "@chanho/react";
import { Bell, PanelLeft, Settings } from "lucide-react";
import type { User } from "../store/types";
import { getCurrentUser } from "../store/wikiStore";
import { useTheme } from "../../../app/theme";
import { useAuth } from "../../../auth/AuthGate";
import { GlobalSearchField } from "./GlobalSearchField";

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
  const toast = useToast();

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
          {/* 알림 — 벨 아이콘 자리. 알림함은 서버 알림 이벤트(W18)와 함께 연결한다 */}
          <Button
            size="small"
            variant="ghost"
            iconOnly
            aria-label="알림"
            title="알림"
            onClick={() =>
              toast({ title: "알림함은 준비 중입니다", description: "멘션·페이지 업데이트 알림이 여기에 모입니다." })
            }
          >
            <Bell size={16} aria-hidden="true" />
          </Button>
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
            ]}
          />
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
