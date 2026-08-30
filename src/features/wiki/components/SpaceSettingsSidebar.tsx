import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import { ChevronLeft, LayoutTemplate, Settings, Trash2, Users } from "lucide-react";
import type { Space } from "../store/types";
import { SECTION_LABEL, SETTINGS_SECTIONS } from "../pages/SpaceSettingsPage";
import { SidebarResizer } from "./SidebarResizer";
import { useSidebarPrefs } from "../lib/sidebarPrefs";

const SECTION_ICON = {
  general: Settings,
  permissions: Users,
  templates: LayoutTemplate,
  danger: Trash2,
} as const;

/**
 * 스페이스 설정 전용 사이드바(W23).
 *
 * 설정을 탭으로 두니 항목이 늘어날수록 가로로 밀렸고, 어느 설정을 보고 있는지가 URL에도 남지
 * 않았다. 설정은 페이지 트리와 함께 볼 이유가 없는 별도 화면이라 사이드바째 바꾼다 —
 * 컨플루언스 스페이스 설정과 같은 구조다.
 *
 * 맨 위의 "돌아가기"가 유일한 탈출구다. 설정 사이드바에는 페이지 트리가 없어서, 이게 없으면
 * 브라우저 뒤로가기 말고는 스페이스로 돌아갈 방법이 없다.
 */
export function SpaceSettingsSidebar({ space }: { space: Space }) {
  // 콘텐츠 사이드바와 같은 폭 설정을 쓴다 — 화면을 옮길 때마다 폭이 튀면 자리가 흔들린다.
  const { width, setWidth } = useSidebarPrefs();
  const [displayWidth, setDisplayWidth] = useState(width);
  useEffect(() => {
    setDisplayWidth(width);
  }, [width]);

  return (
    <aside className="wiki-sidebar space-settings-sidebar" style={{ width: displayWidth }}>
      {/*
        머리에 스페이스를 세운다 — 설정 화면에는 트리가 없어서, 이 줄이 "어느 스페이스의 설정인가"를
        말해 주는 유일한 자리이자 돌아가는 유일한 길이다.
      */}
      <div className="space-settings-head">
        {/*
          보이는 글자는 스페이스 이름뿐이지만 접근성 이름은 "무엇을 하는 링크인가"여야 한다 —
          화살표는 aria-hidden이라 읽히지 않고, 이름만으로는 돌아가는 길인지 알 수 없다.
        */}
        <NavLink
          to={`/spaces/${space.id}`}
          className="space-settings-back"
          aria-label={`${space.name}(으)로 돌아가기`}
        >
          {/* 아이콘은 아래 항목들과 같은 열에 온다 — 한 칸이라도 어긋나면 붙여 놓은 티가 난다 */}
          <ChevronLeft className="global-nav-icon" size={16} aria-hidden="true" />
          <span className="space-settings-back-name">{space.name}</span>
        </NavLink>
      </div>

      <nav className="space-settings-nav" aria-label="스페이스 설정">
        <h2 className="wiki-sidebar-section-title">설정</h2>
        <ul>
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = SECTION_ICON[section];
            return (
              <li key={section}>
                <NavLink
                  to={`/spaces/${space.id}/settings/${section}`}
                  className={({ isActive }) =>
                    isActive ? "global-nav-item global-nav-item--active" : "global-nav-item"
                  }
                >
                  <Icon className="global-nav-icon" size={16} aria-hidden="true" />
                  <span>{SECTION_LABEL[section]}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <SidebarResizer width={displayWidth} onDrag={setDisplayWidth} onCommit={setWidth} />
    </aside>
  );
}
