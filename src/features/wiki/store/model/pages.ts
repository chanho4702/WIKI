// 문서·트리·버전·휴지통·템플릿 도메인 타입 — 백엔드 계약 문서의 엔티티 표와 1:1(store/CLAUDE.md).
import type { Comment } from "./comments";
import type { InheritedRestriction } from "./org";

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
  /**
   * 내가 이 문서를 고칠 수 있는가(서버 PageResponse.canEdit). **단건 조회에서만** 채워지고 그 밖의 응답·목업은
   * null/undefined = 모름이다. 모를 때는 쓰기 어포던스를 숨기지 않는다(서버가 403으로 최종 판정한다).
   */
  canEdit?: boolean | null;
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

/**
 * 버전 이력 한 쪽 — 최신부터. 다음 쪽은 `nextBefore`(버전 번호)를 `before`로 넘겨 읽는다.
 * 쪽 경계가 번호라 읽는 사이에 새 버전이 저장돼도 겹치거나 빠지지 않는다.
 */
export interface VersionPage {
  /** 메타만(title·body는 빈 값) — 본문은 getVersionByNumber/getVersion으로 읽는다. */
  versions: PageVersion[];
  nextBefore: number | null;
  /** 이 문서의 전체 버전 수. */
  total: number;
}

export interface UpdatePageOptions {
  /** 편집 시작 또는 마지막 성공 저장 때 받은 버전. 생략 시 비대화형 호출이 최신 버전을 조회한다. */
  expectedVersion?: number;
  /** 변경 요약(선택) — 이 저장이 만든 버전의 이력에 붙는다. */
  changeNote?: string;
  /**
   * 호출자가 이미 아는 현재 부모(null = 루트). 제목·본문·expectedVersion과 함께 주면 백엔드 어댑터가
   * 저장 직전 본문 포함 조회를 생략한다(W-19). 생략(undefined)하면 예전처럼 조회해 채운다.
   * 부모 변경 수단이 아니다 — 다르면 서버가 거부한다(이동은 movePage).
   */
  parentId?: string | null;
}

/** 오래된 편집본 저장을 서버가 거부했을 때 로컬 작업과 최신 서버본을 함께 유지하기 위한 오류. */
export class PageConflictError extends Error {
  constructor(public readonly serverPage: Page | null) {
    super("다른 사용자가 먼저 저장했습니다. 내 편집 내용은 그대로 유지됩니다.");
    this.name = "PageConflictError";
  }
}

export interface CopyPageOptions {
  /** 하위 문서까지 복제. 볼 수 없는 하위는 사본에 들어가지 않는다. */
  includeDescendants?: boolean;
  /**
   * 제한을 함께 복사. 생략하면 **복사한다**(true) — 제한된 문서의 사본이 열려 있으면
   * 복사 한 번으로 스페이스 전체에 내용이 열린다.
   */
  includeRestrictions?: boolean;
  /**
   * 복사할 곳(F-03). 둘 다 비우면 원본 옆(같은 스페이스·같은 부모). 스페이스만 주면 그 스페이스 맨 위.
   * 대상 스페이스 편집 권한이 없으면 403, 대상 부모가 다른 스페이스면 400(서버 판정).
   */
  targetSpaceId?: string;
  /** 대상 부모. null이면 대상 스페이스의 맨 위. */
  targetParentId?: string | null;
}

/** 블로그 한 쪽(키셋). nextBefore가 null이면 마지막 쪽 — 빈 items여도 nextBefore가 있으면 계속이다. */
export interface BlogPostPage {
  items: BlogPost[];
  nextBefore: string | null;
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

/** 스페이스 라벨 목록의 한 줄 — 사용 횟수가 있어야 어떤 라벨이 실제로 쓰이는지 보인다. */
export interface LabelCount {
  name: string;
  count: number;
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
