import { useCallback, useSyncExternalStore } from "react";

/**
 * 페이지 별표(즐겨찾기) — starredSpaces.ts와 동일한 패턴(별도 키의 병렬 모듈,
 * pageWidth/sidebarPrefs 관례). 페이지 보기 헤더의 별 토글과 사이드바 "별표 표시된 페이지"
 * 섹션이 공유하는 전역 상태다. 도메인 데이터가 아니라 이 브라우저의 UI 프리퍼런스이므로
 * store 계약을 확장하지 않고 lib에 둔다 — 서버 사용자 설정 승격은 백엔드 정책 결정 목록 항목.
 */
const STORAGE_KEY = "wiki.ui.starredPages";

function readFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const listeners = new Set<() => void>();
let cachedSnapshot: string[] = readFromStorage();

function getSnapshot(): string[] {
  const next = readFromStorage();
  if (!arraysEqual(next, cachedSnapshot)) {
    cachedSnapshot = next;
  }
  return cachedSnapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStarredPages(): string[] {
  return readFromStorage();
}

export function setStarredPages(ids: string[]): void {
  try {
    if (ids.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }
  } catch {
    // 저장 실패(용량 초과, 접근 차단 등) — 조용히 무시
  }
  listeners.forEach((listener) => listener());
}

/** 삭제된 페이지의 죽은 id가 별표 목록에 영구히 남지 않게 — 페이지 목록 로드 시 1회 호출. */
export function pruneStarredPages(validIds: string[]): void {
  const current = getStarredPages();
  const pruned = current.filter((id) => validIds.includes(id));
  if (pruned.length !== current.length) {
    setStarredPages(pruned);
  }
}

/** 페이지 삭제 경로에서 해당 별표를 즉시 제거한다. */
export function removeStarredPage(pageId: string): void {
  const current = getStarredPages();
  if (current.includes(pageId)) {
    setStarredPages(current.filter((id) => id !== pageId));
  }
}

export function useStarredPages(): {
  starred: string[];
  toggle: (pageId: string) => void;
} {
  const starred = useSyncExternalStore(subscribe, getSnapshot);
  const toggle = useCallback((pageId: string) => {
    const current = getStarredPages();
    const next = current.includes(pageId)
      ? current.filter((id) => id !== pageId)
      : [...current, pageId];
    setStarredPages(next);
  }, []);
  return { starred, toggle };
}
