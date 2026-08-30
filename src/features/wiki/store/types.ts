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
  /** 페이지 이모지 아이콘(노션/컨플식) — 트리·제목 옆에 표시. 없으면 null/undefined(기본 문서 아이콘). */
  icon?: string | null;
  /** 누적 조회수 — 구버전 백엔드 응답엔 없다(표시 생략). */
  views?: number;
  body: string; // 마크다운 원문
  version: number; // 낙관적 락 카운터. 편집 세션은 로드 시 받은 값을 저장 요청까지 유지한다.
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
  /**
   * 변경 요약 — 저장할 때 남긴 한 줄(선택). 없으면 undefined.
   * 버전이 수십 개가 되면 누가·언제만으로는 어느 것이 되돌릴 지점인지 알 수 없다.
   */
  changeNote?: string;
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
}

/** 인라인 댓글을 만들 때 넘기는 앵커 — 화면에서 드래그한 구간이다. */
export interface CommentAnchor {
  quote: string;
  occurrence: number;
}

export interface Attachment {
  id: string;
  pageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  /** 1부터. 같은 이름으로 다시 올리면 오른다 — id는 그대로다(W23). */
  version?: number;
}

/** 첨부의 지난 버전 한 줄. 현재 내용은 여기 없다(Attachment 자체가 곧 현재다). */
export interface AttachmentVersion {
  version: number;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string | null;
}

/**
 * REST 인증을 WebSocket URL에 노출하지 않기 위한 짧은 수명의 1회용 공동 편집 ticket.
 * raw ticket은 메모리에서 Hocuspocus 인증 메시지로만 전달하고 저장하거나 로깅하지 않는다.
 */
export interface CollaborationTicket {
  ticket: string;
  room: string;
  websocketPath: string;
  expiresAt: string;
}

export interface CollaborationBootstrap {
  created: boolean;
  basePageVersion: number;
  generation: number;
}

export interface CollaborationDraftCommit {
  page: Page;
  generation: number;
}

export interface CollaborationDraftCommitOptions {
  expectedVersion: number;
  expectedGeneration: number;
}

export interface UpdatePageOptions {
  /** 편집 시작 또는 마지막 성공 저장 때 받은 버전. 생략 시 비대화형 호출이 최신 버전을 조회한다. */
  expectedVersion?: number;
  /** 변경 요약(선택) — 이 저장이 만든 버전의 이력에 붙는다. */
  changeNote?: string;
}

/** 오래된 편집본 저장을 서버가 거부했을 때 로컬 작업과 최신 서버본을 함께 유지하기 위한 오류. */
export class PageConflictError extends Error {
  constructor(public readonly serverPage: Page | null) {
    super("다른 사용자가 먼저 저장했습니다. 내 편집 내용은 그대로 유지됩니다.");
    this.name = "PageConflictError";
  }
}

export interface AttachmentUploadOptions {
  /** 호출자가 취소하면 전송을 중단한다. 서버가 이미 수신한 경계 상황은 pending reconciliation이 정리한다. */
  signal?: AbortSignal;
  /** 전송된 요청 바이트 기준 0~100 정수 진행률. */
  onProgress?: (percent: number) => void;
  /** 페이지 저장 전 에디터 임시 업로드로 기록한다. */
  pending?: boolean;
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

export interface CopyPageOptions {
  /** 하위 문서까지 복제. 볼 수 없는 하위는 사본에 들어가지 않는다. */
  includeDescendants?: boolean;
  /**
   * 제한을 함께 복사. 생략하면 **복사한다**(true) — 제한된 문서의 사본이 열려 있으면
   * 복사 한 번으로 스페이스 전체에 내용이 열린다.
   */
  includeRestrictions?: boolean;
}

/** 페이지 템플릿 — 그 스페이스가 합의한 문서 형태. */
export interface PageTemplate {
  id: string;
  spaceId: string;
  name: string;
  description: string | null;
  icon: string | null;
  content: string;
  updatedAt: string | null;
}

export interface TemplateInput {
  name: string;
  description?: string | null;
  icon?: string | null;
  content: string;
}

/** 페이지의 조상 경로 — 루트부터 부모까지. 자기 자신은 없다(제목은 이미 크게 보인다). */
export interface PagePath {
  id: string;
  titles: string[];
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

/* ── 페이지 제한 (W18) ─────────────────────────────────────── */

export type RestrictionPrincipalType = "user" | "team";

export interface RestrictionPrincipal {
  type: RestrictionPrincipalType;
  id: string;
}

/** 조상에서 상속되는 보기 제한 — 다이얼로그의 읽기 전용 표시. */
export interface InheritedRestriction {
  pageId: string;
  pageTitle: string;
  principals: RestrictionPrincipal[];
}

/** 빈 배열 = 해당 타입 제한 없음(모두 허용). */
export interface PageRestrictions {
  view: RestrictionPrincipal[];
  edit: RestrictionPrincipal[];
  inherited: InheritedRestriction[];
}

export interface Team {
  id: string;
  name: string;
}

/**
 * 이동 영향(W18 §5) — 새 조상의 보기 제한이 이 페이지에 새로 적용될 때 서버(또는 목업)가
 * 확인 없는 이동을 이 오류로 멈춘다. 화면이 확인을 받으면 confirmImpact로 재시도한다.
 */
export class MoveImpactError extends Error {
  constructor(
    message: string,
    public readonly newlyRestrictedBy: InheritedRestriction[],
  ) {
    super(message);
    this.name = "MoveImpactError";
  }
}

export type NotificationType = "mentioned" | "page_updated" | "comment";

export interface Notification {
  id: string;
  /** 수신자 — 목업은 항상 현재 사용자 행만 보여준다. */
  userId: string;
  type: NotificationType;
  pageId: string;
  /** 라우팅용(/spaces/{s}/pages/{p}) — 페이지 삭제 시 알림도 함께 사라져 대부분 존재. */
  spaceId: string;
  pageTitle: string;
  actorId: string;
  createdAt: string;
  read: boolean;
}

export interface NotificationList {
  unreadCount: number;
  items: Notification[];
}

/**
 * 휴지통 한 줄(W21-1). 사용자가 직접 버린 페이지만 항목이 되고, 함께 딸려간 하위는
 * `descendantCount`로만 센다 — 하위 30개를 지운 사람에게 31줄을 보여주지 않는다.
 */
export interface TrashItem {
  id: string;
  title: string;
  type: PageType;
  icon?: string | null;
  deletedAt: string;
  deletedBy: string;
  descendantCount: number;
}

/**
 * 복원 결과. `reparentedToRoot`는 원래 부모가 사라져 최상위로 올라왔다는 뜻이다 —
 * 화면이 알려주지 않으면 사용자가 문서를 엉뚱한 곳에서 찾는다.
 */
export interface PageRestoreResult {
  page: Page;
  reparentedToRoot: boolean;
  restoredCount: number;
}

/**
 * 지연 트리의 노드 하나(2026-08-28). 본문이 없고 `childCount`가 있다.
 *
 * childCount가 필요한 이유: 지연 트리는 자식을 불러오기 전에 펼침 화살표를 그릴지 정해야 한다.
 * 없으면 "펼쳤더니 비어 있는" 노드가 생기거나, 화살표를 그리려고 전부 미리 불러오게 된다.
 */
export interface PageNode {
  id: string;
  parentId: string | null;
  title: string;
  type: PageType;
  status: PageStatus;
  position: number;
  icon?: string | null;
  /** 폴더 화면의 "마지막 편집" 열이 쓴다 — 그 때문에 페이지를 한 건씩 다시 읽는 편이 더 비싸다. */
  updatedBy?: string;
  updatedAt?: string;
  childCount: number;
}

/**
 * 스페이스 멤버 권한 한 줄(org-service grant).
 * 주체는 사용자 또는 팀이고, 역할은 세 단계다 — 보기·편집·관리.
 */
export interface SpaceGrant {
  id: string;
  subjectType: "user" | "team";
  subjectId: string;
  role: "viewer" | "editor" | "admin";
}

/** 스페이스 라벨 목록의 한 줄 — 사용 횟수가 있어야 어떤 라벨이 실제로 쓰이는지 보인다. */
export interface LabelCount {
  name: string;
  count: number;
}

/** localStorage `wiki.v1`에 저장되는 루트 구조 */
export interface WikiData {
  users: User[];
  spaces: Space[];
  pages: Page[];
  versions: PageVersion[];
  comments: Comment[];
  /** 알림 — 목업 전용 저장(백엔드 모드는 V11 notification 테이블). 없던 저장분 호환 optional. */
  notifications?: Notification[];
  /** 페이지 제한(W18) — 목업 저장. 키 = pageId. 없던 저장분 호환 optional. */
  restrictions?: Record<string, { view: RestrictionPrincipal[]; edit: RestrictionPrincipal[] }>;
  /**
   * 휴지통(W21-1) — 목업 저장. 버려진 페이지를 살아 있는 배열에서 빼고 여기로 옮긴다.
   * 백엔드는 같은 행에 deleted_at을 찍지만(V13), 목업은 별도 배열이 조회 경로를 건드리지 않아
   * "버린 문서가 어딘가에서 되살아나는" 실수를 구조적으로 막는다.
   */
  trash?: TrashEntry[];
  /** 페이지 라벨(W21-2) — 키 = pageId. 없던 저장분 호환 optional. */
  labels?: Record<string, string[]>;
  /** 페이지 템플릿(W23) — 스페이스 스코프. */
  templates?: PageTemplate[];
  /** 페이지 구독(W21-4) — 키 = pageId, 값 = 구독자 id 목록. */
  watches?: Record<string, string[]>;
  /** 스페이스 권한(W22) — 키 = spaceId. 백엔드 모드는 org-service가 원장이다. */
  grants?: Record<string, SpaceGrant[]>;
}

/** 휴지통에 보관된 묶음 — 복원하려면 버전·댓글도 함께 보관해야 한다. */
export interface TrashEntry {
  page: Page;
  deletedAt: string;
  deletedBy: string;
  /** 사용자가 직접 버린 페이지만 true — cascade로 딸려간 하위는 false(복원 묶음의 경계). */
  root: boolean;
  versions: PageVersion[];
  comments: Comment[];
}
