// 별표·최근 방문·내 작업 도메인 타입.
import type { PageStatus, PageType } from "./pages";

/**
 * 서버가 들고 있는 별표 원장(W23).
 *
 * `listStars()`가 null을 주면 "이 모드에는 서버 원장이 없다"는 뜻이다(목업). 그때는 브라우저에
 * 있는 것이 곧 전부이므로 동기화를 건너뛴다 — 빈 목록으로 덮어써서 별표를 날리면 안 된다.
 */
export interface StarsSnapshot {
  spaceIds: string[];
  pages: StarredPageRow[];
}

export interface StarredPageRow {
  id: string;
  spaceId: string;
  spaceName: string | null;
  title: string;
  icon: string | null;
  type: PageType;
}

/**
 * 사람 프로필의 "최근 작업한 문서" 한 줄(F-07) — 그 사람이 만들었거나 마지막으로 고친 문서.
 * 호출자 기준 가시성(보기 제한·초안 규칙)을 거른 결과만 온다. `updatedAt`을 모르면 null.
 */
export interface PersonPageRow extends StarredPageRow {
  status: PageStatus;
  updatedAt: string | null;
}

/**
 * 홈 피드 한 줄(2026-10-24) — 컨플 홈 "인기"·"팔로잉". 스페이스를 가로지르는 한 요청의 결과라
 * 스페이스 이름을 함께 준다. 게시 문서만 온다(초안·보관·휴지통·폴더 제외, 호출자 가시성 필터).
 * `updatedBy`를 모르면 null, `viewCount`는 누적 조회수(팔로잉에도 실린다).
 */
export interface FeedPageRow extends PersonPageRow {
  updatedBy: string | null;
  viewCount: number;
}

/** 내 작업 한 줄(W23) — 문서를 가로지르므로 스페이스 이름을 함께 준다. */
export interface MyTask {
  pageId: string;
  spaceId: string;
  spaceName: string | null;
  pageTitle: string;
  /** 본문 줄 번호(1부터) — 토글이 이 줄을 다시 쓴다. */
  lineNo: number;
  text: string;
  assigneeId: string | null;
  dueDate: string | null;
  done: boolean;
}
