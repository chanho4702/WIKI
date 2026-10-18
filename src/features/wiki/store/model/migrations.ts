// 컨플루언스 DC 이관(M1) 도메인 타입.

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

/** 관리자 잡 목록의 한 줄(GET /api/migration). */
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

/** 잡 상세(GET /api/migration/{id}). */
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
  /**
   * 어느 항목에도 매달리지 않은 손실(링크 정리 실패 등). 항목 표(`/items`)에도 손실 보고서에도
   * 나오지 않으므로 상세 화면이 직접 보여 준다. 대개 빈 목록이고, 구버전 응답에는 아예 없다.
   */
  jobIssues?: MigrationJobIssue[];
}

/**
 * 잡 단위 손실 한 건. 항목 손실(`MigrationIssueSummary`)과 달리 code별로 묶지 않고 위치를
 * 그대로 들고 온다 — 링크 정리 실패는 "어느 문서가 안 고쳐졌나"가 곧 조치할 대상이다.
 */
export interface MigrationJobIssue {
  severity: MigrationIssueSeverity;
  code: string;
  /** `page:1042`·`job:12` 형태. */
  sourcePath: string;
  occurrences: number;
}

/**
 * 링크 정리 재실행 결과. 이미 정리된 문서에는 임시 링크가 없어 손대지 않으므로 다시 눌러도
 * 안전하고, 두 번째 실행의 touched가 0인 것이 곧 "고칠 것이 없다"는 뜻이다.
 */
export interface MigrationLinkFixupResult {
  touched: number;
  failed: number;
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
  /** 잡 단위 손실. 이 필드가 없던 저장분 호환으로 optional — 읽을 때 빈 배열로 본다. */
  jobIssues?: MigrationJobIssue[];
}
