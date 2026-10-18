// 통합 검색·검색 색인 관리 도메인 타입.

export type SearchDocType = "PAGE" | "ATTACHMENT";

export type SearchPageType = "PAGE" | "FOLDER" | "BLOG";

export interface SearchHit {
  id: string;
  docType: SearchDocType;
  spaceId: string;
  spaceKey: string;
  spaceName: string;
  /** 첨부파일이면 소속 페이지 ID, 페이지·폴더면 null. */
  pageId: string | null;
  /** 페이지·폴더 hit의 실제 콘텐츠 타입, 첨부파일이면 null. */
  pageType: SearchPageType | null;
  title: string | null;
  filename: string | null;
  /** OpenSearch가 `<em>`으로 매치를 표시한 안전한 텍스트 조각. 화면은 raw HTML로 렌더하지 않는다. */
  highlights: string[];
  updatedAt: string | null;
  score: number;
}

export interface SearchResults {
  total: number;
  /** false면 total은 비인가 건수를 제외하고 현재까지 확인한 결과의 하한값이다. */
  totalExact: boolean;
  tookMs: number;
  hits: SearchHit[];
}

export interface SearchContentInput {
  query: string;
  page?: number;
  size?: number;
  spaceIds?: string[];
  docTypes?: SearchDocType[];
  /**
   * 문서 세부 종류(F-01 "블로그만") — PAGE 결과에만 걸린다. **라이트 검색만** 받는다(OpenSearch 스키마에는
   * 없다) — 화면은 라이트 설치에서만 이 필터를 보여 준다.
   */
  pageTypes?: SearchPageType[];
  /** 초안 포함(서버 SearchInput.includeDrafts). 그래도 볼 수 있는 초안(작성자·관리자)만 나온다. 기본 제외. */
  includeDrafts?: boolean;
  /** 마지막 수정자 — 첨부에는 없는 필드라 페이지만 걸린다(W22). */
  authorIds?: string[];
  /** ISO-8601 시각 또는 날짜(2026-08-01). 경계는 포함이다. */
  updatedAfter?: string;
  updatedBefore?: string;
  /** 라벨 — 여럿이면 하나라도 붙은 문서를 찾는다(OR). 저장할 때와 같은 규칙으로 정규화된다. */
  labels?: string[];
  /** 정렬. 생략하면 관련도. */
  sort?: SearchSort;
}

/** 두 검색 엔진(OpenSearch·라이트)이 같은 값으로 같은 순서를 낸다. */
export type SearchSort = "RELEVANCE" | "UPDATED_DESC" | "UPDATED_ASC";

/** 검색 색인 현황(전역 관리자). runningJob이 있으면 지금 재색인이 돌고 있다. */
export interface SearchIndexStatus {
  pageIndex: string;
  attachmentIndex: string;
  /** -1이면 세지 못한 것 — 0건과 구분해야 한다. */
  pageDocs: number;
  attachmentDocs: number;
  runningJob: ReindexJob | null;
}

export interface ReindexJob {
  jobId: string;
  state: "RUNNING" | "SUCCEEDED" | "FAILED";
  aliasSwitched: boolean;
  pagesIndexed: number;
  attachmentsIndexed: number;
  pageIndex: string | null;
  attachmentIndex: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  failure: string | null;
}

export type ContentSearchErrorKind = "rate-limited" | "unavailable" | "unauthorized" | "unknown";

/** 검색 화면이 429·503을 서로 다른 복구 안내로 표현하기 위한 안정적인 스토어 오류. */
export class ContentSearchError extends Error {
  constructor(
    message: string,
    public readonly kind: ContentSearchErrorKind,
  ) {
    super(message);
    this.name = "ContentSearchError";
  }
}
