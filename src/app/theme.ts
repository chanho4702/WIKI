import { useCallback, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "wiki.theme";

/** 저장된 테마를 읽는다. 없으면 시스템 선호도, 그마저 없으면 light. */
export function readStoredTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

/** document 루트에 테마를 반영한다 — DS 토큰의 [data-theme="dark"] 스위치. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** 초기 로드 시 한 번 호출 — 저장된 테마를 즉시 적용해 깜빡임을 막는다. */
export function initTheme(): void {
  applyTheme(readStoredTheme());
}

/** 테마 상태 + 토글. 변경 시 document와 localStorage에 함께 반영한다. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
