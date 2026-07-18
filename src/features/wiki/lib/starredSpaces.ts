import { useCallback, useSyncExternalStore } from "react";

/**
 * 스페이스 별표(즐겨찾기) 설정 (W6 T3, W7 T6 리뷰 수정) — 컨플루언스식 스페이스 플라이아웃의
 * "별표 표시됨" 섹션 + 사이드바 "별표 표시된 스페이스" 섹션이 공유하는 전역 상태.
 * pageWidth.ts/sidebarPrefs.ts와 동일한 패턴: localStorage 단일 키에 spaceId 배열을 저장하고,
 * 접근 예외(시크릿 모드 등) 시 조용히 기본값(빈 배열)으로 대체한다.
 * 서버 사용자 설정 승격 여부는 backend 요구사항 문서 정책 결정 목록에 별도로 남겨 둔다.
 *
 * W7 T6 리뷰 Important 수정: 이전엔 useStarredSpaces가 컴포넌트 로컬 useState였다 — WikiLayout
 * (사이드바, 상시 마운트)과 SpaceFlyout(임시 마운트)이 각자 별도의 React 상태를 들고 있어, 한쪽에서
 * toggle해도 다른 쪽은 리마운트 전까지 갱신되지 않았다. 모듈 스코프 리스너 집합(listeners) +
 * useSyncExternalStore로 바꿔, 어느 인스턴스에서 toggle하든 구독 중인 모든 컴포넌트가 같은 렌더
 * 사이클에서 즉시 갱신되도록 한다.
 */
const STORAGE_KEY = "wiki.ui.starredSpaces";

/** localStorage에서 별표 스페이스 id 배열을 즉시 읽어온다(캐시 없이 항상 실제 값). 값 부재/오류/
 * 손상(비배열, 비문자열 원소) 시 빈 배열. */
function readFromStorage(): string[] {
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

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const listeners = new Set<() => void>();

/** useSyncExternalStore의 getSnapshot — 매 호출마다 localStorage를 실제로 읽어 진짜 값과
 * 어긋나지 않게 하되, 값이 실제로 바뀌지 않았으면 이전 배열 참조를 그대로 반환한다(내용이 같은데
 * 매번 새 배열을 만들면 useSyncExternalStore가 매 렌더 "스토어가 바뀌었다"고 오판해 무한
 * 리렌더 루프에 빠진다 — Object.is 참조 비교 계약). */
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

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

/** 저장된 별표 스페이스 id 목록을 읽는다. 값 부재/오류/손상(비배열, 비문자열 원소) 시 빈 배열. */
export function getStarredSpaces(): string[] {
  return readFromStorage();
}

/**
 * 저장된 별표 목록에서 더 이상 존재하지 않는 스페이스 id를 제거한다(T3 잔여 픽스) — 스페이스가
 * 삭제되거나 이 브라우저에서 접근 불가능해진 뒤에도 별표 목록에 죽은 id가 영구히 남는 것을 막는다.
 * WikiLayout이 스페이스 목록을 처음 로드한 시점에 1회 호출한다. 제거할 게 없으면 저장을 건드리지
 * 않는다(불필요한 쓰기 방지).
 */
export function pruneStarredSpaces(validIds: string[]): void {
  const current = getStarredSpaces();
  const pruned = current.filter((id) => validIds.includes(id));
  if (pruned.length !== current.length) {
    setStarredSpaces(pruned);
  }
}

/** 별표 스페이스 id 목록을 저장한다. 빈 배열은 기본값이므로 키를 제거해 부재로 표현한다.
 * 저장 성공/실패와 무관하게 구독자에게 알려 최신 localStorage 값으로 다시 동기화하게 한다. */
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
  notifyListeners();
}

/** 스페이스 별표 상태 + 토글 훅 (모듈 스코프 스토어 기반 — useSyncExternalStore). 전역 설정이므로
 * 인자가 없다(스페이스 목록과 무관). 반환 시그니처는 기존과 동일해 사용처(SpaceFlyout, WikiLayout)
 * 수정이 필요 없다. */
export function useStarredSpaces(): {
  starred: string[];
  toggle: (spaceId: string) => void;
} {
  const starred = useSyncExternalStore(subscribe, getSnapshot);

  const toggle = useCallback((spaceId: string) => {
    const current = getStarredSpaces();
    const next = current.includes(spaceId)
      ? current.filter((id) => id !== spaceId)
      : [...current, spaceId];
    setStarredSpaces(next);
  }, []);

  return { starred, toggle };
}
