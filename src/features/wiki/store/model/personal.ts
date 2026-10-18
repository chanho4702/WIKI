// 별표·최근 방문·내 작업 도메인 타입.
import type { PageType } from "./pages";

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
