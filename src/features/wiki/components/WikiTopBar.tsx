import { useEffect, useState } from "react";
import { Avatar, Button, Switch, TopBar } from "@chanho/react";
import type { User } from "../store/types";
import { getCurrentUser } from "../store/wikiStore";
import { useTheme } from "../../../app/theme";
import { useAuth } from "../../../auth/AuthGate";

export interface WikiTopBarProps {
  /** 지정하면 브랜드 슬롯 좌측에 사이드바 토글 버튼을 렌더한다(WikiLayout 전용 — 사이드바가 있는
   * 화면에서만 의미가 있다). 미지정 시 토글 버튼 없이 브랜드만 보인다(SpaceDirectoryPage처럼
   * 사이드바가 없는 화면). */
  onSidebarToggle?: () => void;
  /** 토글 버튼의 aria-expanded 값 — onSidebarToggle을 넘길 때 함께 넘긴다. */
  sidebarExpanded?: boolean;
}

/**
 * 상단 고정 바(TopBar) — 원래 WikiLayout에 인라인으로 있던 브랜드/사이드바 토글(W7 T6)/
 * 다크모드 스위치/로그아웃/아바타를 그대로 옮긴 것 (W7 T7). SpaceDirectoryPage처럼 사이드바가
 * 없는 화면에서도 재사용하기 위해 onSidebarToggle을 선택적으로 받는다 — 계약: WikiLayout의
 * 동작은 이 추출 전후로 무변경이다.
 */
export function WikiTopBar({ onSidebarToggle, sidebarExpanded }: WikiTopBarProps) {
  const { theme, toggle } = useTheme();
  const { user: authUser, logout } = useAuth();
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    void getCurrentUser().then(setMe);
  }, []);

  return (
    <TopBar
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
              ⧉
            </Button>
          ) : null}
          <span className="wiki-brand">WIKI</span>
        </>
      }
      actions={
        <>
          <Switch label="다크 모드" checked={theme === "dark"} onCheckedChange={toggle} />
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
  );
}
