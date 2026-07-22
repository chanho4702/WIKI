/**
 * 최근 방문 페이지 로그 (클라이언트, localStorage) — "이어서 작업" 카드의 소스.
 * 도메인 데이터가 아니라 사용자별 UI 상태라 wikiStore가 아닌 lib에서 관리한다(별표·pageWidth와 동일 계열).
 * 백엔드에 방문 추적 엔드포인트가 없어(설계 §10) 두 모드 공통으로 클라이언트에 쌓는다.
 */
const KEY = "wiki.ui.recentVisits";
const MAX = 20;

export interface RecentVisit {
  id: string;
  at: string; // ISO 방문 시각
}

/** 최근 방문 목록(최신 먼저). 손상/부재 시 빈 배열. */
export function getRecentVisits(limit = 6): RecentVisit[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (v): v is RecentVisit =>
          typeof v === "object" &&
          v !== null &&
          typeof (v as RecentVisit).id === "string" &&
          typeof (v as RecentVisit).at === "string",
      )
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** 방문 기록. 같은 페이지 재방문 시 맨 앞으로 올리고 시각을 갱신한다. */
export function recordVisit(pageId: string): void {
  if (!pageId) return;
  try {
    const list = getRecentVisits(MAX).filter((v) => v.id !== pageId);
    list.unshift({ id: pageId, at: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // 저장 실패(용량·접근차단) — 조용히 무시. 화면은 방문로그 없이도 동작.
  }
}
