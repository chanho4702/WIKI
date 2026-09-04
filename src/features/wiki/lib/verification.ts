import type { Page, VerificationState } from "../store/types";

/**
 * 검증 배지 판정(W27-5).
 *
 * 만료 여부는 **화면이** 계산한다. 서버가 만료 상태를 저장하면 아무도 열지 않는 문서는 영원히
 * "검증됨"으로 남거나, 만료를 찍기 위한 배치 작업이 하나 더 필요해진다. 유효기간은 날짜뿐이고
 * 오늘도 날짜뿐이라 비교가 타임존에 흔들리지 않는다.
 *
 * 유효기간 당일까지는 유효하다 — "12월 3일까지"라고 고른 사람의 의도는 그날을 포함한다.
 */
export function verificationState(page: Pick<Page, "verifiedUntil">, today = todayIso()): VerificationState {
  const until = page.verifiedUntil;
  if (!until) return "none";
  return until >= today ? "verified" : "expired";
}

/** 로컬 시간대 기준 오늘(`YYYY-MM-DD`) — `toISOString()`은 UTC라 저녁에 하루가 앞선다. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 기본 유효기간 — 백엔드 PageService.VERIFICATION_DAYS와 같은 90일. */
export const VERIFICATION_DAYS = 90;

export function defaultVerifiedUntil(now = new Date()): string {
  const until = new Date(now);
  until.setDate(until.getDate() + VERIFICATION_DAYS);
  return todayIso(until);
}
