// 댓글·인라인 댓글·리액션 도메인 타입.

export type CommentKind = "page" | "inline";

/**
 * 댓글 스레드 한 쪽. 단위는 **스레드**(최상위 + 답글 전부) — 답글만 다음 쪽으로 밀리지 않는다.
 * 스레드는 최신부터 내려가고(`nextBefore` = 더 오래된 쪽), 화면은 오래된 순으로 다시 그린다.
 */
export interface CommentThreadPage {
  comments: Comment[];
  nextBefore: string | null;
  /** 이 종류(page/inline)의 전체 스레드 수. */
  threadCount: number;
  /** 이 종류의 전체 댓글 수(답글 포함). */
  commentCount: number;
}

export interface Comment {
  id: string;
  pageId: string;
  authorId: string;
  /** 백엔드 모드에서 서버가 주는 작성 시점 이름 스냅샷 — users 목록에 없을 때 표시 폴백. */
  authorName?: string;
  body: string;
  parentId: string | null; // null = 최상위, 값 있으면 답글 (중첩 1단 제한)
  createdAt: string;
  updatedAt: string | null; // 수정된 적 없으면 null — "(수정됨)" 표시 근거
  /** "inline"이면 본문 구간에 붙은 댓글(W21-4). 없으면 "page"로 간주(이 필드 도입 이전 데이터). */
  anchorType?: "page" | "inline";
  /** 인라인 댓글이 가리키는 **렌더된 본문**의 텍스트. 못 찾으면 스레드는 "위치 없음"으로 남는다. */
  anchorQuote?: string | null;
  /** 같은 텍스트가 여러 번 나올 때 몇 번째인지(0부터). */
  anchorOccurrence?: number | null;
  /** 값이 있으면 해결된 스레드 — 본문 하이라이트에서 내려간다. */
  resolvedAt?: string | null;
  /** 리액션 집계(W23). 목록이 한 번에 준다 — 댓글마다 따로 묻지 않는다. */
  reactions?: ReactionSummary[];
}

/** 리액션 한 칩 — 누가 눌렀는지는 주지 않는다("누가 안 눌렀나"까지 읽히는 화면이 된다). */
export interface ReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;
}

/** 고정 집합 — 서버와 같은 순서다. 아무 문자나 받으면 집계가 예측 불가능한 기호로 찬다. */
export const REACTION_EMOJIS = ["👍", "❤️", "🎉", "👀", "😄", "🙏"] as const;

/** 인라인 댓글을 만들 때 넘기는 앵커 — 화면에서 드래그한 구간이다. */
export interface CommentAnchor {
  quote: string;
  occurrence: number;
}
