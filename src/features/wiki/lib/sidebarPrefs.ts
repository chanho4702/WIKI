import { useCallback, useState } from "react";

/**
 * 사이드바 UI 설정 (Task 19) — 컨플루언스식 접기/드래그 너비 조절.
 * 페이지와 무관한 전역 설정이므로 pageId 없이 단일 키 쌍으로 저장한다 (T18 pageWidth와 같은 패턴).
 */
export interface SidebarPrefs {
  collapsed: boolean;
  width: number;
}

const COLLAPSED_KEY = "wiki.ui.sidebar.collapsed";
const WIDTH_KEY = "wiki.ui.sidebar.width";

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 480;
export const SIDEBAR_DEFAULT_WIDTH = 288;

/** 폭을 [200, 480] 범위로 자른다. 숫자가 아니거나(NaN 등) 유한하지 않으면 기본값(288)으로 대체한다. */
export function clampSidebarWidth(px: number): number {
  if (!Number.isFinite(px)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, px));
}

/** 저장된 사이드바 설정을 읽는다. 값 부재/오류/손상 시 기본값(펼침, 288px)으로 대체한다. */
export function getSidebarPrefs(): SidebarPrefs {
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    // 접근 차단(시크릿 모드 등) — 기본값(펼침)으로 대체
    collapsed = false;
  }

  let width = SIDEBAR_DEFAULT_WIDTH;
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    width = raw === null ? SIDEBAR_DEFAULT_WIDTH : clampSidebarWidth(Number(raw));
  } catch {
    width = SIDEBAR_DEFAULT_WIDTH;
  }

  return { collapsed, width };
}

/** 접힘 상태를 저장한다. 펼침(false)은 기본값이므로 키를 제거해 부재로 표현한다. */
export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      localStorage.setItem(COLLAPSED_KEY, "1");
    } else {
      localStorage.removeItem(COLLAPSED_KEY);
    }
  } catch {
    // 저장 실패(용량 초과, 접근 차단 등) — 조용히 무시. 화면 상태는 세션 내에서는 유지된다.
  }
}

/** 사이드바 폭을 저장한다. 범위를 벗어난 값은 clamp 후 저장한다. */
export function setSidebarWidth(px: number): void {
  try {
    localStorage.setItem(WIDTH_KEY, String(clampSidebarWidth(px)));
  } catch {
    // 저장 실패 — 조용히 무시
  }
}

/** 사이드바 접기/너비 상태 + 갱신 훅. 전역 설정이므로 인자가 없다(페이지 무관). */
export function useSidebarPrefs(): SidebarPrefs & {
  setCollapsed: (collapsed: boolean) => void;
  setWidth: (px: number) => void;
} {
  const [prefs, setPrefs] = useState<SidebarPrefs>(() => getSidebarPrefs());

  const setCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    setPrefs((prev) => ({ ...prev, collapsed }));
  }, []);

  const setWidth = useCallback((px: number) => {
    const clamped = clampSidebarWidth(px);
    setSidebarWidth(clamped);
    setPrefs((prev) => ({ ...prev, width: clamped }));
  }, []);

  return { ...prefs, setCollapsed, setWidth };
}
