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
  /** 개인 스페이스의 주인(W23). 없으면 팀 스페이스. */
  ownerId?: string | null;
}

/**
 * 콘텐츠 타입 — 폴더는 "묶는 껍데기", 페이지는 "읽는 문서".
 * 별도 엔티티가 아니라 Page의 필드로 둔 결정과 그 대가는
 * `docs/roadmap/2026-07-26-folder-and-editor-layout.md` P1 참조.
 * 폴더도 body/version 필드를 형식적으로 갖지만 **쓰지 않는다** — 폴더 화면은 본문 대신 자식 목록을
 * 보여주고, 편집 화면으로 들어가는 경로도 없다.
 */
/**
 * 콘텐츠 타입. "blog"(W24)는 트리 밖에 사는 문서다 — 부모가 없고 날짜순으로 읽힌다.
 * 본문·리비전·댓글·라벨·검색·권한은 페이지와 같고, 다른 것은 "어디에 놓이는가"뿐이다.
 */
export type PageType = "page" | "folder" | "blog";

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
  /** 보관 시각(W23). 값이 있으면 트리·검색에서 빠지되 링크로는 열린다. */
  archivedAt?: string | null;
  /** 목업 전용 — 백엔드 archived_by/archived_root에 해당(묶음 경계 계산용). */
  archivedBy?: string | null;
  archivedRoot?: boolean;
  /**
   * 문서 소유자(W27-5) — 기본 책임자 표시일 뿐 권한과 무관하다(권한은 제한 W18이 담당).
   * 기본값이 없다: 정하지 않은 문서는 undefined/null이고 createdBy로 대신하지 않는다.
   */
  ownerId?: string | null;
  /** 검증(W27-5) — 사람이 "읽어봤고 맞다"를 누른 시각·주체. */
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  /**
   * 검증 유효기간 — `YYYY-MM-DD`(날짜만). 만료 판정은 **화면이** 오늘과 비교해서 한다.
   * 서버는 저장만 한다 — 만료돼도 문서가 숨거나 잠기지 않고 배지 문구만 바뀐다.
   */
  verifiedUntil?: string | null;
  /**
   * 이관된 문서의 **원본 작성자 이름**(W29 M3). 값이 있으면 서버가 원본 작성자를 우리 계정으로
   * 대조하지 못했다는 뜻이다 — 그때 메타 줄은 `updatedBy`(이관 담당자) 대신 이 이름을 보여준다.
   * 대조된 문서는 null이고 화면은 평소대로 우리 사용자를 쓴다.
   */
  importedAuthorName?: string | null;
  /** 원본 문서 주소 — 이름만으로는 누구인지 확인할 길이 없어 툴팁으로 원본까지 연결한다. */
  importedSourceUrl?: string | null;
}

/** 검증 배지의 세 상태 — 없음/유효/만료. `verifiedUntil`만으로 결정된다. */
export type VerificationState = "none" | "verified" | "expired";

export interface PageVersion {
  id: string;
  pageId: string;
  version: number; // 1부터 증가
  title: string;
  body: string; // 그 시점의 내용
  savedBy: string;
  /** 저장 시점 편집자 이름 스냅샷(W23). 디렉터리에서 사라진 사람도 이름으로 남는다. 없으면 id로 폴백. */
  savedByName?: string | null;
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
 * 감사 로그 한 줄.
 *
 * `targetLabel`은 그때 그 이름의 스냅샷이다 — 지워진 대상도 읽혀야 하므로 id로 다시 조회하지
 * 않는다.
 */
export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  detail: string | null;
  actorId: string;
  createdAt: string | null;
}

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

/* ── 조직(org-service) ─────────────────────────────────────────
 * 설계: platform-backend/docs/superpowers/specs/2026-09-05-user-invite-team-permission-design.md
 * 관리 화면 자체는 `@chanho/org-admin` 패키지가 그린다 — 여기 타입은 위키가 직접 쓰는 것만 둔다. */

export type OrgMemberStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

/**
 * `/api/org/me` — org-service가 보는 나(설계 §3.3).
 *
 * **전역 관리자 판정의 단일 근거다**: `globalRoles`에 `"ADMIN"`이 있으면 관리자. 이 값은
 * org-service의 GLOBAL/ADMIN grant에서 나오며 Keycloak realm role과는 다른 개념이라
 * 토큰의 roles로 대신할 수 없다. `status`가 `PENDING`이면 초대 없이 로그인해 격리된 계정이다.
 */
export interface OrgMe {
  id: string;
  displayName: string;
  email: string | null;
  status: OrgMemberStatus;
  globalRoles: string[];
}

/**
 * 목업 org 상태 — 백엔드 모드에는 대응물이 없다(org-service가 원장).
 * 없으면 "활성 전역 관리자"로 다룬다: 목업/dev에서도 관리 화면을 열 수 있어야 한다.
 */
export interface OrgMockState {
  self?: { status: OrgMemberStatus; globalRoles: string[] };
  /** 사용자별 상태 override(기본 ACTIVE). 승인 대기 목록이 읽는다. */
  memberStatus?: Record<string, OrgMemberStatus>;
  invitations?: OrgMockInvitation[];
  /** 전역 역할 grant — 스페이스 권한(`grants`)과 달리 리소스가 없다. */
  globalGrants?: OrgMockGrant[];
}

export interface OrgMockGrant {
  id: string;
  subjectType: "USER" | "TEAM";
  subjectId: string;
  role: "VIEWER" | "EDITOR" | "ADMIN";
}

export interface OrgMockInvitation {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  message: string | null;
  createdAt: string;
  expiresAt: string;
  /** 서버는 생성·재발송 응답에서만 링크를 준다(토큰은 해시로만 저장) — 목업도 같게 둔다. */
  inviteUrl: string | null;
  mailSent: boolean;
  teams: { teamId: string; role: "LEAD" | "MEMBER" }[];
  grants: { scope: "GLOBAL" | "SPACE" | "PROJECT"; resourceId: string | null; role: "VIEWER" | "EDITOR" | "ADMIN" }[];
}

/** 팀원 한 줄(W23). 이름은 서버가 함께 준다 — 디렉터리를 다시 뒤지지 않는다. */
export interface TeamMember {
  memberId: string;
  displayName: string | null;
  role: string;
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

/** "page_published"(W27-4)는 새 문서 게시 — 스페이스 구독이 생기며 의미가 붙은 사건이다. */
export type NotificationType =
  | "mentioned"
  | "page_updated"
  | "comment"
  | "shared"
  | "page_published";

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
  /** 공유 메모(shared). 다른 타입은 없다. */
  note?: string | null;
}

/**
 * 알림 설정(W23) — 이메일 채널. 알림함은 항상 켜져 있고, 여기서는 "어떤 알림을 메일로도 받을지"만
 * 정한다. emailConfigured가 false면(서버에 발송 구성이 없음) 스위치는 저장되지만 아무것도 가지
 * 않는다 — 화면이 그 사실을 먼저 말해야 한다.
 */
export interface NotificationPrefs {
  emailConfigured: boolean;
  /** 서버가 토큰에서 스냅샷한 수신 주소. 아직 모르면 null. */
  email: string | null;
  emailEnabled: boolean;
  /** 바로 보낼지(IMMEDIATE), 하루 한 번 모아 보낼지(DAILY). */
  emailMode: "IMMEDIATE" | "DAILY";
  mentioned: boolean;
  pageUpdated: boolean;
  comment: boolean;
  shared: boolean;
}

export type NotificationPrefsPatch = Pick<
  NotificationPrefs,
  "emailEnabled" | "emailMode" | "mentioned" | "pageUpdated" | "comment" | "shared"
>;

/** 블로그 목록 한 줄(W24) — 본문 대신 발췌. 글 자체는 Page(type "blog")로 열고 고친다. */
export interface BlogPost {
  id: string;
  title: string;
  status: PageStatus;
  icon: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  excerpt: string;
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
  /** commenter(W23): 보고 댓글만. 계층은 viewer < commenter < editor < admin(org-service). */
  role: "viewer" | "commenter" | "editor" | "admin";
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
  /** 알림 설정(W23) — 목업 저장. 키 = userId. */
  notificationPrefs?: Record<string, NotificationPrefsPatch>;
  /** 스페이스 삭제 기록 — 목업 저장. 백엔드는 audit_log의 SPACE_DELETED 행(V30). */
  spaceAudit?: AuditEntry[];
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
  /** 리액션(W23) — 키 = "PAGE:id" | "COMMENT:id", 값 = 사용자별 이모지 목록. */
  reactions?: Record<string, Record<string, string[]>>;
  /** 페이지 템플릿(W23) — 스페이스 스코프. */
  templates?: PageTemplate[];
  /** 팀(W23) — 시드 두 팀 외에 만든 것. 팀원은 팀 id → 사용자 id 목록. */
  teams?: Team[];
  teamMembers?: Record<string, string[]>;
  /** 페이지 구독(W21-4) — 키 = pageId, 값 = 구독자 id 목록. */
  watches?: Record<string, string[]>;
  /**
   * 스페이스 구독(W27-4) — 키 = spaceId, 값 = 구독자 id 목록. 백엔드 V32 space_watch에 해당.
   * 페이지 구독과 달리 자동 구독이 없다 — 스페이스에는 "관심의 사건"이 없다.
   */
  spaceWatches?: Record<string, string[]>;
  /** 스페이스 권한(W22) — 키 = spaceId. 백엔드 모드는 org-service가 원장이다. */
  grants?: Record<string, SpaceGrant[]>;
  /**
   * 마이그레이션 잡(M1) — 목업 저장. 백엔드는 migration_job/item/issue 테이블이다.
   * **원본 토큰은 여기에 들어가지 않는다** — 목업도 저장하지 않는 것이 계약이다(설계 §1.1 P8).
   */
  migrations?: MigrationJobRecord[];
  /** 조직 관리 화면(U4)의 목업 상태. 백엔드 모드는 org-service가 원장이다. */
  org?: OrgMockState;
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

// ── 마이그레이션(M1, 컨플루언스 DC) ────────────────────────────
// 설계: docs/superpowers/specs/2026-09-05-confluence-dc-migration-design.md §1.3·§2.
// 열거값 문자열은 백엔드 enum 이름 그대로다(MigrationJobStatus 등) — 화면에서만 한국어로 옮긴다.

export type MigrationProvider = "CONFLUENCE_DC" | "NOTION";
export type MigrationMode = "DRY_RUN" | "IMPORT";
export type MigrationJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type MigrationItemStatus = "PENDING" | "RUNNING" | "RETRY_WAIT" | "COMPLETED" | "DEAD_LETTER";
export type MigrationStage = "EXTRACT" | "NORMALIZE" | "MEDIA_COPY" | "RESOLVE" | "VERIFY" | "DONE";
export type MigrationIssueSeverity = "INFO" | "WARNING" | "ERROR";

/**
 * 원본 접속 정보 — **요청 본문으로만 오간다.**
 * 토큰은 응답 DTO에도, 목업 저장에도, 화면 상태에도 남기지 않는다(설계 §1.1 P8).
 */
export interface MigrationSourceInput {
  baseUrl: string;
  spaceKey: string;
  token: string;
}

/** 연결 확인 결과(M-01) — 잡을 만들기 전에 "이 주소·이 키가 맞는가"만 본다. */
export interface MigrationSourceProbe {
  spaceName: string;
  homepageId: string | null;
  /** 서버가 총 개수를 못 세면 null — 0건과 구분해야 한다. */
  pageCount: number | null;
}

/** 잡에 붙은 원본 요약. 토큰 자리는 아예 없다. */
export interface MigrationSourceSummary {
  baseUrl: string;
  spaceKey: string;
  spaceName: string | null;
  discoveredCount: number;
}

/**
 * 항목 집계. 키는 백엔드 enum 이름이지만 `Record<string, number>`로 둔다 —
 * 서버가 값을 더해도 화면이 깨지지 않아야 하고, 없는 키는 0으로 읽는다.
 */
export interface MigrationCounts {
  byStatus: Record<string, number>;
  byStage: Record<string, number>;
}

/** 관리자 잡 목록의 한 줄(GET /api/wiki/migrations). */
export interface MigrationJobSummary {
  id: string;
  provider: MigrationProvider;
  targetSpaceId: string;
  mode: MigrationMode;
  status: MigrationJobStatus;
  createdAt: string | null;
  discoveredCount: number;
  sourceSpaceKey: string | null;
}

/** 잡 상세(GET /api/wiki/migrations/{id}). */
export interface MigrationJob {
  id: string;
  provider: MigrationProvider;
  sourceInstanceId: string | null;
  targetSpaceId: string;
  mode: MigrationMode;
  status: MigrationJobStatus;
  itemCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  /** provider가 CONFLUENCE_DC일 때만 채워진다. 구버전 응답 호환으로 null 허용. */
  source: MigrationSourceSummary | null;
  counts: MigrationCounts;
}

/** 발견 결과 — 재발견은 멱등이라 이미 있는 항목이 skipped로 센다. */
export interface MigrationDiscoverResult {
  discovered: number;
  enqueued: number;
  skipped: number;
}

export interface MigrationItem {
  id: string;
  jobId: string;
  externalObjectId: string;
  sourceVersion: string | null;
  stage: MigrationStage;
  status: MigrationItemStatus;
  retryCount: number;
  nextAttemptAt: string | null;
  targetPageId: string | null;
  lastErrorCode: string | null;
}

export interface MigrationItemPage {
  items: MigrationItem[];
  page: number;
  size: number;
  total: number;
}

export interface MigrationItemFilter {
  status?: MigrationItemStatus;
  stage?: MigrationStage;
  /** 0부터. */
  page?: number;
}

/** 손실 한 줄 — 같은 code가 여러 항목·여러 위치에서 나오므로 위치 수와 총 발생 수를 함께 센다. */
export interface MigrationIssueSummary {
  severity: MigrationIssueSeverity;
  code: string;
  distinctPaths: number;
  occurrences: number;
  /**
   * 대표 위치 한 개(`attachment:설계도.png`·`macro:jira` 등). 어느 원본 조각이 문제였는지를
   * 알아야 사람이 판단할 수 있다. 서버가 안 주면 화면은 위치 수만 보여준다.
   */
  sampleSourcePath?: string | null;
}

/** 데드레터 한 줄 — 재실행 전에 사람이 판단해야 하므로 목록으로 노출한다. */
export interface MigrationDeadLetter {
  itemId: string;
  externalObjectId: string;
  stage: MigrationStage;
  lastErrorCode: string | null;
  retryCount: number;
  deadLetteredAt: string | null;
}

/** dry-run과 실제 import가 같은 형태로 내는 보고서. */
export interface MigrationReport {
  job: MigrationJob;
  itemsByStatus: Record<string, number>;
  itemsByStage: Record<string, number>;
  issues: MigrationIssueSummary[];
  deadLetters: MigrationDeadLetter[];
}

/** 목업 저장 형태 — 항목 목록에서 집계·보고서를 그때그때 파생한다(토큰 없음). */
export interface MigrationJobRecord {
  id: string;
  provider: MigrationProvider;
  sourceInstanceId: string | null;
  targetSpaceId: string;
  mode: MigrationMode;
  status: MigrationJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  source: MigrationSourceSummary | null;
  items: MigrationItem[];
}
