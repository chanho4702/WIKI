import { useEffect, useState } from "react";
import { fetchAlmIssueCards } from "../store/wikiStore";
import { getPlatformFeatures } from "../store/platformApi";
import type { AlmIssueCard } from "../store/types";

/** 카드 신선도 — 보기 1회 + 60초(설계 §4.4, 임시값). 상태는 ALM에서 바뀌므로 길게 들고 있지 않는다. */
export const ALM_CARD_TTL_MS = 60_000;

/** 키 → 카드(없음/못 봄이면 null). 페이지를 오가도 60초 안이면 다시 묻지 않는다. */
const cache = new Map<string, { card: AlmIssueCard | null; at: number }>();
/** 같은 키 묶음의 진행 중 요청 — 같은 본문이 두 번 그려져도(StrictMode·발췌) 요청은 한 번. */
const inflight = new Map<string, Promise<void>>();

const EMPTY: ReadonlyMap<string, AlmIssueCard> = new Map();

function fresh(key: string, now: number) {
  const hit = cache.get(key);
  return hit && now - hit.at < ALM_CARD_TTL_MS ? hit : undefined;
}

function fromCache(keys: readonly string[]): ReadonlyMap<string, AlmIssueCard> {
  const now = Date.now();
  const out = new Map<string, AlmIssueCard>();
  for (const key of keys) {
    const card = fresh(key, now)?.card;
    if (card) out.set(key, card);
  }
  return out.size ? out : EMPTY;
}

function load(missing: string[]): Promise<void> {
  const sig = missing.join(",");
  let pending = inflight.get(sig);
  if (!pending) {
    pending = fetchAlmIssueCards(missing)
      .then((cards) => {
        const at = Date.now();
        // 응답에 없는 키(없는 이슈·볼 수 없는 이슈)도 "없음"으로 기억한다 — 60초 안에 같은 키를 또 묻지 않게
        for (const key of missing) cache.set(key, { card: null, at });
        for (const card of cards) cache.set(card.key, { card, at });
      })
      .finally(() => inflight.delete(sig));
    inflight.set(sig, pending);
  }
  return pending;
}

/**
 * 본문의 ALM 이슈 키 → 카드. **페이지(본문) 단위로 한 번에** 묻는다 — 링크마다 묻지 않는다.
 *
 * - 설치 제품에 ALM이 없으면(`products.alm=false`, 모름 포함) 아예 묻지 않는다.
 * - 실패(5xx·네트워크·401)는 **조용히** 빈 결과다 — 스마트 링크는 장식이고, 실패의 정답은
 *   원래 링크로 이미 정해져 있다. 실패는 캐시하지 않는다(다음 보기에서 다시 시도).
 * - 로딩 중에도 빈 결과다 — 인라인 텍스트가 흔들리지 않게 스켈레톤을 두지 않는다(설계 §5).
 */
export function useAlmIssueCards(
  keys: readonly string[],
  options: {
    /**
     * 카드가 화면에 반영되기 **직전**(React가 DOM을 바꾸기 전)에 부른다. 본문 DOM에 남이 심은 노드
     * (인라인 댓글 하이라이트 `mark`)를 이때 걷어 내야 React가 자기 텍스트 노드를 찾을 수 있다.
     */
    beforeChange?: () => void;
  } = {},
): ReadonlyMap<string, AlmIssueCard> {
  const { beforeChange } = options;
  const sig = [...new Set(keys)].sort().join(",");
  const [state, setState] = useState<{ sig: string; cards: ReadonlyMap<string, AlmIssueCard> }>(() => ({
    sig,
    cards: sig ? fromCache(sig.split(",")) : EMPTY,
  }));

  useEffect(() => {
    if (!sig) return;
    const wanted = sig.split(",");
    let cancelled = false;
    void getPlatformFeatures()
      .then(async (features) => {
        if (!features.products.alm) return;
        const now = Date.now();
        const missing = wanted.filter((key) => !fresh(key, now));
        if (missing.length) await load(missing);
        if (cancelled) return;
        beforeChange?.();
        setState({ sig, cards: fromCache(wanted) });
      })
      .catch(() => {
        // 조용히 원래 링크로 둔다(위 주석) — 콘솔 오류도 남기지 않는다(설계 S1).
      });
    return () => {
      cancelled = true;
    };
    // beforeChange는 매 렌더 새 함수일 수 있다 — 키 묶음이 바뀔 때만 다시 묻는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // 키 묶음이 바뀐 직후 한 렌더 동안 이전 본문의 카드를 내지 않는다
  return state.sig === sig ? state.cards : EMPTY;
}

/** 테스트 전용 — 모듈 캐시를 비운다. */
export function __resetAlmIssueCardsForTest(): void {
  cache.clear();
  inflight.clear();
}
