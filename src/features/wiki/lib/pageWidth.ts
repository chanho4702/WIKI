import { useCallback, useEffect, useState } from "react";

/**
 * 페이지 너비 설정 (Task 18) — 노션 "전체 너비" / 컨플루언스 고정 폭 대응.
 * `Page` 타입·스토어·백엔드 계약은 동결이므로 클라이언트 UI 설정(localStorage)으로만 구현한다.
 * 서버 저장(페이지 메타데이터화)은 wiki-service 정책 결정 목록에 별도로 남겨 둔다.
 */
export type PageWidth = "default" | "full";

const STORAGE_PREFIX = "wiki.ui.width.";

function storageKey(pageId: string): string {
  return `${STORAGE_PREFIX}${pageId}`;
}

/** 저장된 페이지 너비를 읽는다. 값 부재/오류 시 기본 폭. */
export function getPageWidth(pageId: string): PageWidth {
  try {
    return localStorage.getItem(storageKey(pageId)) === "full" ? "full" : "default";
  } catch {
    // 접근 차단(시크릿 모드 등) — 기본 폭으로 대체
    return "default";
  }
}

/** 페이지 너비를 저장한다. "full"만 저장하고 기본값은 키를 제거해 부재로 표현한다. */
export function setPageWidth(pageId: string, width: PageWidth): void {
  try {
    if (width === "full") {
      localStorage.setItem(storageKey(pageId), "full");
    } else {
      localStorage.removeItem(storageKey(pageId));
    }
  } catch {
    // 저장 실패(용량 초과, 접근 차단 등) — 조용히 무시. 화면 상태는 세션 내에서는 유지된다.
  }
}

/**
 * 페이지별 너비 상태 + 토글 훅.
 * pageId가 바뀌면(같은 편집/보기 라우트 컴포넌트가 리마운트 없이 재사용되는 라우트 이동 대응) 새 pageId
 * 기준으로 다시 읽는다. pageId가 없으면(생성 화면) 항상 기본 폭이며 toggle은 아무 동작도 하지 않는다.
 */
export function usePageWidth(pageId: string | undefined): {
  width: PageWidth;
  toggle: () => void;
} {
  const [width, setWidth] = useState<PageWidth>(() => (pageId ? getPageWidth(pageId) : "default"));

  useEffect(() => {
    setWidth(pageId ? getPageWidth(pageId) : "default");
  }, [pageId]);

  const toggle = useCallback(() => {
    if (!pageId) return;
    setWidth((prev) => {
      const next: PageWidth = prev === "full" ? "default" : "full";
      setPageWidth(pageId, next);
      return next;
    });
  }, [pageId]);

  return { width, toggle };
}
