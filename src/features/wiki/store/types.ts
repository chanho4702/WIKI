export interface User {
  id: string;
  name: string;
}

export interface Space {
  id: string;
  key: string; // 스페이스 구분 접두어(중복 금지). 목업은 대문자("DEV"), 백엔드 모드는 소문자 그대로 통과([a-z0-9-]+)
  name: string;
  description?: string;
  createdAt: string;
}

/**
 * 콘텐츠 타입 — 폴더는 "묶는 껍데기", 페이지는 "읽는 문서".
 * 별도 엔티티가 아니라 Page의 필드로 둔 결정과 그 대가는
 * `docs/roadmap/2026-07-26-folder-and-editor-layout.md` P1 참조.
 * 폴더도 body/version 필드를 형식적으로 갖지만 **쓰지 않는다** — 폴더 화면은 본문 대신 자식 목록을
 * 보여주고, 편집 화면으로 들어가는 경로도 없다.
 */
export type PageType = "page" | "folder";

/**
 * 게시 상태 — 사이드바 "+"로 즉시 만든 문서는 초안(draft)으로 트리에 나타나고, 편집 화면에서
 * "게시"를 눌러야 published가 된다(기획 P3 결정: 초안 개념 도입).
 * 폴더는 게시 개념이 없다 — 항상 "published"로 만든다.
 */
export type PageStatus = "draft" | "published";

export interface Page {
  id: string;
  spaceId: string;
  parentId: string | null; // null = 루트 페이지
  /** 없으면 "page"로 간주한다 — 이 필드 도입 이전에 저장된 데이터(localStorage·백엔드) 호환. */
  type: PageType;
  /** 없으면 "published"로 간주한다 — 초안 개념 도입 이전 문서는 전부 게시된 상태였다. */
  status: PageStatus;
  title: string;
  body: string; // 마크다운 원문
  version: number; // 낙관적 락 카운터(백엔드 연동). 목업은 항상 1.
  position: number; // 형제 내 정렬 (생성순 max+1)
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageVersion {
  id: string;
  pageId: string;
  version: number; // 1부터 증가
  title: string;
  body: string; // 그 시점의 내용
  savedBy: string;
  savedAt: string;
}

export interface Comment {
  id: string;
  pageId: string;
  authorId: string;
  body: string;
  parentId: string | null; // null = 최상위, 값 있으면 답글 (중첩 1단 제한)
  createdAt: string;
  updatedAt: string | null; // 수정된 적 없으면 null — "(수정됨)" 표시 근거
}

export interface Attachment {
  id: string;
  pageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export type SearchDocType = "PAGE" | "ATTACHMENT";
export type SearchPageType = "PAGE" | "FOLDER";

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
  tookMs: number;
  hits: SearchHit[];
}

export interface SearchContentInput {
  query: string;
  page?: number;
  size?: number;
  spaceIds?: string[];
  docTypes?: SearchDocType[];
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

/**
 * 자식이 있는 페이지·폴더를 지울 때 자식을 어떻게 할지 (기획 P2 결정, 2026-07-28).
 * - `promote`: 자식을 삭제 대상의 부모로 올리고 대상만 지운다(삭제 대상의 자리·순서를 이어받는다).
 * - `cascade`: 후손 전부를 함께 지운다.
 * 옵션을 주지 않으면 자식이 있을 때 거부한다 — 어느 쪽인지는 화면이 사용자에게 물어 정한다.
 */
export interface DeletePageOptions {
  children?: "promote" | "cascade";
}

/** localStorage `wiki.v1`에 저장되는 루트 구조 */
export interface WikiData {
  users: User[];
  spaces: Space[];
  pages: Page[];
  versions: PageVersion[];
  comments: Comment[];
}
