import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Avatar, Badge, Button, Dropdown, TopBar } from "@chanho/react";
import { Bell, Database, DatabaseBackup, Keyboard, KeyRound, LogOut, Moon, PanelLeft, ScrollText, Settings, Sun, Users } from "lucide-react";
import type { User } from "../store/types";
import { getCurrentUser, getOrgMe } from "../store/wikiStore";
import { useTheme } from "../../../app/theme";
import { useAuth } from "../../../auth/AuthGate";
import { GlobalSearchField } from "./GlobalSearchField";
import { ShortcutHelpModal } from "./ShortcutHelpModal";
import { NotificationBell } from "./NotificationBell";
import { useReadOnly } from "../lib/readOnly";

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
  const readOnly = useReadOnly();
  const { theme, toggle } = useTheme();
  const { user: authUser, logout } = useAuth();
  const [me, setMe] = useState<User | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const navigate = useNavigate();
  /*
   * 전역 관리자에게만 관리 항목을 띄운다.
   *
   * 판단 근거는 `/api/org/me.globalRoles`다(U4, 설계 §6) — org-service의 GLOBAL/ADMIN grant에서
   * 나오며 Keycloak realm role과는 다른 개념이라 토큰의 roles로 대신할 수 없다. 전에는 관리자
   * 전용 엔드포인트(색인 현황)를 찔러 성공 여부로 판단했는데, 그러면 **그 서비스의 장애가
   * "관리자가 아님"으로 둔갑해** 관리 메뉴가 통째로 사라진다. 상단바는 앱당 한 번 마운트되므로
   * 세션당 요청 하나로 끝난다.
   */
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  useEffect(() => {
    // 읽기 전용(익명) 인스턴스에는 관리자 메뉴 자체가 없다 — 물어봐야 401/403 잡음만 남는다.
    if (readOnly) return;
    let cancelled = false;
    void getOrgMe()
      .then((me) => {
        if (!cancelled) setIsGlobalAdmin(me.globalRoles.includes("ADMIN"));
      })
      .catch(() => {
        if (!cancelled) setIsGlobalAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [readOnly]);

  // 익명 인스턴스는 `/api/me`를 호출하지 않는다 — me가 null이면 아바타 자체가 뜨지 않는다.
  // 실패도 삼킨다: 사용자 이름을 못 읽는 것이 상단바 전체를 죽일 이유는 아니다.
  useEffect(() => {
    if (readOnly) return;
    void getCurrentUser()
      .then(setMe)
      .catch(() => setMe(null));
  }, [readOnly]);

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
          {/* 공개 문서 인스턴스임을 상단바에서 한 번에 알린다 — 편집 버튼이 없는 이유의 설명이다 */}
          {readOnly ? (
            <Badge appearance="neutral">읽기 전용 문서</Badge>
          ) : null}
          {/* 알림 — 미읽음 배지 + 알림함 팝오버(멘션/관심 페이지 업데이트/댓글) */}
          {readOnly ? null : <NotificationBell />}
          {/* 설정 — 드롭다운 골격. 하위 항목은 결정 대기 상태라 자리만 잡아 둔다.
            * 읽기 전용에서는 서버에 무언가를 쓰는 항목(알림 설정·관리자)만 빼고, 이 브라우저에만
            * 저장되는 테마·단축키는 남긴다 — 공개 문서도 다크 모드로 읽을 수 있어야 한다. */}
          <Dropdown
            trigger={
              <Button size="small" variant="ghost" iconOnly aria-label="설정" title="설정">
                <Settings size={16} aria-hidden="true" />
              </Button>
            }
            items={[
              // 설정 항목은 아이콘 · 제목 · 한 줄 설명 구조다(SettingsItem과 같은 규칙)
              {
                label: theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환",
                description: "화면 색을 바꿉니다. 이 브라우저에만 저장됩니다",
                icon: theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />,
                onSelect: toggle,
              },
              ...(readOnly
                ? []
                : [
                    {
                      label: "알림 설정",
                      description: "어떤 알림을 이메일로도 받을지 고릅니다",
                      icon: <Bell size={16} aria-hidden="true" />,
                      onSelect: () => navigate("/settings/notifications"),
                    },
                  ]),
              {
                label: "단축키 도움말",
                description: "키보드로 빠르게 다니는 법",
                icon: <Keyboard size={16} aria-hidden="true" />,
                onSelect: () => setShortcutHelpOpen(true),
              },
              // 전역 관리자에게만 보인다 — 아닌 사람에게 띄우면 눌러도 "권한 없음"만 나온다
              ...(isGlobalAdmin
                ? [
                    {
                      label: "사용자·팀",
                      description: "사람을 초대하고 팀과 전역 역할을 관리합니다",
                      icon: <Users size={16} aria-hidden="true" />,
                      onSelect: () => navigate("/admin/org"),
                    },
                    {
                      label: "검색 색인 관리",
                      description: "검색 색인 상태를 보고 다시 만듭니다",
                      icon: <Database size={16} aria-hidden="true" />,
                      onSelect: () => navigate("/admin/search"),
                    },
                    {
                      label: "스페이스 삭제 기록",
                      description: "지워진 스페이스와 누가 지웠는지",
                      icon: <ScrollText size={16} aria-hidden="true" />,
                      onSelect: () => navigate("/admin/audit"),
                    },
                    {
                      label: "마이그레이션",
                      description: "컨플루언스 Data Center 스페이스를 옮깁니다",
                      icon: <DatabaseBackup size={16} aria-hidden="true" />,
                      onSelect: () => navigate("/admin/migrations"),
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
                {
                  label: "알림 설정",
                  description: "어떤 알림을 이메일로도 받을지 고릅니다",
                  icon: <Bell size={16} aria-hidden="true" />,
                  onSelect: () => navigate("/settings/notifications"),
                },
                /* 토큰 관리 화면은 계정 포털(myFront `/app`)에 있다 — 같은 오리진이지만 다른
                 * SPA라 라우터가 아니라 전체 이동이다. 이 메뉴는 아바타(=로그인 사용자)가 있을
                 * 때만 뜨므로 읽기 전용 인스턴스에는 애초에 나타나지 않는다. */
                {
                  label: "API 토큰",
                  description: "스크립트·CI에서 쓰는 개인 토큰 관리",
                  icon: <KeyRound size={16} aria-hidden="true" />,
                  onSelect: () => window.location.assign("/app/tokens"),
                },
                ...(authUser
                  ? [{
                      label: "로그아웃",
                      description: "이 기기에서 로그아웃합니다",
                      icon: <LogOut size={16} aria-hidden="true" />,
                      onSelect: () => void logout(),
                    }]
                  : []),
              ]}
            />
          ) : null}
        </>
      }
    />
  );
}
