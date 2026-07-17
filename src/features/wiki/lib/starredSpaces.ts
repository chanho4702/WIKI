import { useCallback, useState } from "react";

/**
 * 스페이스 별표(즐겨찾기) 설정 (W6 T3) — 컨플루언스식 스페이스 플라이아웃의 "별표 표시됨" 섹션.
 * pageWidth.ts/sidebarPrefs.ts와 동일한 패턴: localStorage 단일 키에 spaceId 배열을 저장하고,
 * 접근 예외(시크릿 모드 등) 시 조용히 기본값(빈 배열)으로 대체한다.
 * 서버 사용자 설정 승격 여부는 backend 요구사항 문서 정책 결정 목록에 별도로 남겨 둔다.
 */
const STORAGE_KEY = "wiki.ui.starredSpaces";

/** 저장된 별표 스페이스 id 목록을 읽는다. 값 부재/오류/손상(비배열, 비문자열 원소) 시 빈 배열. */
export function getStarredSpaces(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // 접근 차단 또는 JSON 파싱 실패 — 빈 배열(별표 없음)로 대체
    return [];
  }
}

/** 별표 스페이스 id 목록을 저장한다. 빈 배열은 기본값이므로 키를 제거해 부재로 표현한다. */
export function setStarredSpaces(ids: string[]): void {
  try {
    if (ids.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }
  } catch {
    // 저장 실패(용량 초과, 접근 차단 등) — 조용히 무시. 화면 상태는 세션 내에서는 유지된다.
  }
}

/** 스페이스 별표 상태 + 토글 훅. 전역 설정이므로 인자가 없다(스페이스 목록과 무관). */
export function useStarredSpaces(): {
  starred: string[];
  toggle: (spaceId: string) => void;
} {
  const [starred, setStarred] = useState<string[]>(() => getStarredSpaces());

  const toggle = useCallback((spaceId: string) => {
    setStarred((prev) => {
      const next = prev.includes(spaceId)
        ? prev.filter((id) => id !== spaceId)
        : [...prev, spaceId];
      setStarredSpaces(next);
      return next;
    });
  }, []);

  return { starred, toggle };
}
