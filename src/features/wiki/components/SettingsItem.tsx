import type { ReactNode } from "react";

/**
 * 설정 화면의 공통 구조(2026-08-30, 사용자 지시) — 모든 설정은 **아이콘 · 제목 · 한 줄 설명**으로
 * 읽힌다. 컨플루언스 관리 화면과 같다: 항목 이름 아래에 "이게 뭘 하는지" 한 줄이 붙고,
 * 컨트롤(스위치·버튼·입력)은 그 옆에 온다.
 *
 * 전에는 화면마다 제목만 있거나 설명만 있거나 제각각이라, 설정이 늘수록 "이 스위치가 뭐였더라"가
 * 됐다. 구조를 하나로 두면 새 설정을 더할 때도 세 칸만 채우면 된다.
 */

export interface SettingsHeaderProps {
  icon: ReactNode;
  title: string;
  description: string;
  /** 제목 줄 오른쪽 액션(선택) — "글 쓰기" 같은 주 버튼. */
  action?: ReactNode;
}

/** 화면 머리 — 이 설정 묶음이 무엇인지. */
export function SettingsHeader({ icon, title, description, action }: SettingsHeaderProps) {
  return (
    <header className="settings-header">
      <span className="settings-header-icon" aria-hidden="true">{icon}</span>
      <div className="settings-header-text">
        <h1 className="space-settings-title">{title}</h1>
        <p className="space-settings-desc">{description}</p>
      </div>
      {action ? <div className="settings-header-action">{action}</div> : null}
    </header>
  );
}

export interface SettingsItemProps {
  icon: ReactNode;
  /** 제목. 스위치처럼 컨트롤이 제 라벨을 그리면 생략하고 control만 준다(제목이 두 번 보이지 않게). */
  title?: string;
  description?: ReactNode;
  /** 제목 줄에 놓이는 컨트롤 — 스위치·버튼. */
  control?: ReactNode;
  /** 설명 아래에 놓이는 본문 — 입력칸·표 등 큰 것. */
  children?: ReactNode;
}

/** 설정 한 항목 — 아이콘 · 제목 · 한 줄 설명 · 컨트롤. */
export function SettingsItem({ icon, title, description, control, children }: SettingsItemProps) {
  return (
    <div className="settings-item">
      <span className="settings-item-icon" aria-hidden="true">{icon}</span>
      <div className="settings-item-body">
        <div className="settings-item-head">
          {title ? <span className="settings-item-title">{title}</span> : null}
          {control ? <div className="settings-item-control">{control}</div> : null}
        </div>
        {description ? <p className="settings-item-desc">{description}</p> : null}
        {children}
      </div>
    </div>
  );
}
