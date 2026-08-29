import type { ReactNode } from "react";
import { Link } from "react-router";

export interface NavListFlyoutItem {
  key: string;
  icon: ReactNode;
  label: string;
  /** 오른쪽 끝 보조 문구 — 최근이면 방문 시각, 스페이스면 키. */
  meta?: string;
  path: string;
}

export interface NavListFlyoutProps {
  /** 패널의 접근성 이름 — 트리거 항목과 같은 말을 쓴다("최근", "스페이스"). */
  label: string;
  items: NavListFlyoutItem[];
  loading?: boolean;
  emptyText: string;
  /** 하단 "전체 보기"가 가는 목록 화면. */
  morePath: string;
  moreLabel: string;
  /** 항목 클릭 — 이동은 호출 측이 한다(패널을 닫아야 하므로). */
  onNavigate: (path: string) => void;
  /** "전체 보기"는 진짜 링크라 이동을 브라우저에 맡긴다 — 패널만 닫는다. */
  onClose: () => void;
}

/** 기본으로 펼치는 개수 — 더 보려면 목록 화면으로 간다. 사이드바 옆 상자에 스무 줄을 쌓지 않는다. */
export const NAV_FLYOUT_LIMIT = 10;

/**
 * 글로벌 네비 항목의 목록형 플라이아웃 — "최근"·"스페이스"가 공유한다.
 *
 * "별표 표시"(StarredFlyout)는 검색형이라 형태가 다르다: 별표는 사용자가 스스로 모은 것이라
 * 수가 많고 이름을 알고 찾지만, 최근·스페이스는 최신순·이름순으로 훑는 목록이다.
 * 그래서 검색창 대신 상위 N개 + "전체 보기"를 쓴다.
 */
export function NavListFlyout({
  label,
  items,
  loading = false,
  emptyText,
  morePath,
  moreLabel,
  onNavigate,
  onClose,
}: NavListFlyoutProps) {
  const shown = items.slice(0, NAV_FLYOUT_LIMIT);

  return (
    <div className="space-flyout nav-list-flyout" role="dialog" aria-label={label}>
      {loading ? (
        <p className="starred-flyout-empty" role="status">
          불러오는 중
        </p>
      ) : shown.length === 0 ? (
        <p className="starred-flyout-empty">{emptyText}</p>
      ) : (
        <ul className="space-flyout-list">
          {shown.map((item) => (
            <li key={item.key} className="space-flyout-item">
              <button
                type="button"
                className="space-flyout-item-name"
                onClick={() => onNavigate(item.path)}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.meta ? <span className="nav-list-flyout-meta">{item.meta}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* 새 탭으로 열 수 있어야 해서 버튼이 아니라 링크다 — 이동은 브라우저가 한다. */}
      <Link className="nav-list-flyout-more" to={morePath} onClick={onClose}>
        {moreLabel}
      </Link>
    </div>
  );
}
