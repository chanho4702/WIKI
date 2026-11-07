// ALM 이슈 카드 조회(W3 스마트 링크) — 게이트웨이 경유 alm-backend를 **사용자 토큰으로** 직접 부른다.
// 위키 백엔드를 거치지 않는다: 권한 판정은 ALM 몫이고, 위키→ALM 서버 의존을 만들지 않는다(제품 단독 판매).
import { sharedApiFetch } from "../apiClient";
import { mapAlmIssueCard } from "../mapping";
import type { AlmIssueCard } from "../types";
import { json } from "./http";

/** 서버 상한(설계 §4.1 — 51개부터 400). 넘으면 나눠 묻는다. */
export const ALM_CARD_BATCH_LIMIT = 50;

/**
 * 키 묶음 → 볼 수 있는 이슈의 카드. 없는 키·권한 없는 키는 응답에서 **조용히 빠진다**(서버 계약) —
 * 호출자는 "응답에 없음"을 "일반 링크"로 읽는다. 실패(4xx/5xx·네트워크)는 던진다: 삼키는 것은
 * 화면 훅의 정책이지 어댑터의 정책이 아니다.
 */
export async function fetchAlmIssueCards(keys: readonly string[]): Promise<AlmIssueCard[]> {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += ALM_CARD_BATCH_LIMIT) {
    chunks.push(unique.slice(i, i + ALM_CARD_BATCH_LIMIT));
  }
  const pages = await Promise.all(
    chunks.map(async (chunk) => {
      const body = await json<unknown>(
        await sharedApiFetch(`/api/alm/issues/cards?keys=${encodeURIComponent(chunk.join(","))}`),
      );
      return Array.isArray(body) ? body : [];
    }),
  );
  return pages
    .flat()
    .map(mapAlmIssueCard)
    .filter((card): card is AlmIssueCard => card !== null);
}
