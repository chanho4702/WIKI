import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import type { WikiLinkTarget } from "./wikiLinks";

/**
 * `[[제목]]` 판별·자동완성이 **동기로** 읽는 캐시(2026-08-28).
 *
 * 담기는 것은 두 가지뿐이다 — ①문서에 실제로 등장한 제목의 조회 결과 ②최근 자동완성 검색 결과.
 * 스페이스 전량이 아니라 문서 크기·검색어 수에만 비례한다.
 *
 * 훅으로 뽑아둔 이유: 공동 편집 경로는 확장을 `useCollaborationSession`이 만들고, 단독 편집
 * 경로는 `WikiEditor`가 만든다. 두 경로가 같은 캐시를 봐야 링크 칩 판별이 일관된다.
 */
export interface WikiLinkCache {
  targetsRef: RefObject<WikiLinkTarget[]>;
  merge: (found: WikiLinkTarget[]) => void;
}

export function useWikiLinkCache(): WikiLinkCache {
  const targetsRef = useRef<WikiLinkTarget[]>([]);
  const merge = useCallback((found: WikiLinkTarget[]) => {
    const merged = new Map(targetsRef.current.map((t) => [t.id, t]));
    for (const target of found) merged.set(target.id, target);
    targetsRef.current = [...merged.values()];
  }, []);
  return { targetsRef, merge };
}
