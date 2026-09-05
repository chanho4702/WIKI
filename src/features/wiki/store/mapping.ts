// 백엔드(wiki-backend) DTO ↔ 프론트 도메인 타입 순수 변환. 부수효과 없음.
import type {
  Comment,
  MigrationDeadLetter,
  MigrationIssueSummary,
  MigrationItem,
  MigrationItemStatus,
  MigrationJob,
  MigrationJobIssue,
  MigrationJobStatus,
  MigrationJobSummary,
  MigrationMode,
  MigrationProvider,
  MigrationReport,
  MigrationSourceSummary,
  MigrationStage,
  Page,
  PageNode,
  PageStatus,
  PageType,
  PageVersion,
  Space,
} from "./types";

export function toClientId(n: number): string {
  return String(n);
}
export function toBackendId(s: string): number {
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error(`잘못된 백엔드 id: ${s}`);
  return n;
}

interface SpaceDto { id: number; key: string; name: string; description?: string | null; ownerId?: number | string | null }
export function mapSpace(dto: SpaceDto): Space {
  return {
    id: toClientId(dto.id),
    key: dto.key,
    name: dto.name,
    description: dto.description ?? undefined,
    ownerId: dto.ownerId === null || dto.ownerId === undefined ? null : String(dto.ownerId),
    // 백엔드 SpaceResponse엔 createdAt이 없다 → 빈 문자열. ⚠️ 백엔드 모드에서 화면이 이 값을
    // new Date("")로 포맷하면 "Invalid Date"가 노출된다 — 디렉토리 생성일 "-" 폴백은 후속 화면 배선 필요
    // (설계 §7 backend-mode 알려진 한계). 목업 모드는 실제 createdAt이 있어 무관.
    createdAt: "",
  };
}

export interface PageDto {
  /** 보관 시각(W23) — 구버전 응답에는 없다. */
  archivedAt?: string | null;
  id: number; spaceId: number; parentId: number | null; title: string; content: string; version: number;
  /** V9 형제 순서 — 구버전 응답 호환을 위해 optional */
  position?: number;
  /** 백엔드 V2에서 추가. 없던 시절 응답 호환을 위해 optional로 둔다. */
  type?: PageType; status?: PageStatus;
  /** V10 — 이모지 아이콘·조회수. 구버전 응답 호환 optional. */
  icon?: string | null; views?: number;
  /** V33 소유자·검증(W27-5). 서버는 verifiedUntil을 TIMESTAMPTZ로 준다 — 화면은 날짜만 쓴다. */
  ownerId?: number | string | null;
  verifiedAt?: string | null;
  verifiedBy?: number | string | null;
  verifiedUntil?: string | null;
  /** V36 원본 작성자 표시(W29 M3). 대조된 문서·구버전 응답에는 없다. */
  importedAuthorName?: string | null;
  importedSourceUrl?: string | null;
}

/**
 * 서버의 TIMESTAMPTZ("2026-12-03T00:00:00Z")를 화면이 쓰는 날짜("2026-12-03")로 자른다.
 *
 * 검증 유효기간은 사람이 고른 **날짜**다. 시각을 그대로 들고 다니면 만료 비교가 브라우저
 * 타임존에 따라 하루씩 흔들린다 — 목업 모드는 애초에 날짜만 저장하므로 두 모드가 갈린다.
 */
function toDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}
export function mapPage(dto: PageDto): Page {
  // 백엔드 PageResponse엔 시각/작성자가 없다 → 빈 문자열. ⚠️ 백엔드 모드에서 PageView 메타의
  // "N이 수정"(작성자)·수정일(new Date("")→"Invalid Date")과 HistoryModal의 no-op 판정
  // (restored.updatedAt === page.updatedAt, 둘 다 "" → 항상 "변경 없음")이 어긋난다 — 화면 폴백 배선은
  // 후속(설계 §7 backend-mode 알려진 한계). 목업 모드는 실제 값이 있어 무관.
  const now = "";
  return {
    id: toClientId(dto.id),
    spaceId: toClientId(dto.spaceId),
    parentId: dto.parentId === null ? null : toClientId(dto.parentId),
    // 백엔드 V2(page.type/status)가 주는 값을 그대로 쓴다. 필드가 없는 구버전 응답은
    // 도입 이전 기본값(page/published)으로 읽는다.
    type: dto.type ?? "page",
    status: dto.status ?? "published",
    title: dto.title,
    body: dto.content,
    version: dto.version,
    icon: dto.icon ?? null,
    views: dto.views,
    position: dto.position ?? 0,
    createdBy: "", updatedBy: "", createdAt: now, updatedAt: now,
    archivedAt: dto.archivedAt ?? null,
    ownerId: dto.ownerId === null || dto.ownerId === undefined ? null : String(dto.ownerId),
    verifiedAt: dto.verifiedAt ?? null,
    verifiedBy:
      dto.verifiedBy === null || dto.verifiedBy === undefined ? null : String(dto.verifiedBy),
    verifiedUntil: toDateOnly(dto.verifiedUntil),
    importedAuthorName: dto.importedAuthorName ?? null,
    importedSourceUrl: dto.importedSourceUrl ?? null,
  };
}

export interface TreeItemDto { id: number; parentId: number | null; title: string; type?: PageType; status?: PageStatus   /** V9 형제 순서 — 구버전 응답 호환을 위해 optional */
  position?: number;
  /** V10 — 트리에 이모지 아이콘 표시용. */
  icon?: string | null;
  /** 2026-08-29 — 폴더 화면의 "마지막 편집" 열. 구버전 응답 호환을 위해 optional. */
  updatedBy?: number | null;
  updatedAt?: string | null;
}
export function mapPageTree(items: TreeItemDto[]): Page[] {
  // V9부터 서버가 형제 순서(position)를 저장한다(P1-001). 없던 시절 응답은 index+1 폴백.
  return items.map((it, i) => ({
    id: toClientId(it.id),
    spaceId: "",
    parentId: it.parentId === null ? null : toClientId(it.parentId),
    type: it.type ?? "page",
    status: it.status ?? "published",
    title: it.title,
    icon: it.icon ?? null,
    body: "",
    version: 1,
    position: it.position ?? i + 1,
    createdBy: "", updatedBy: "", createdAt: "", updatedAt: "",
  }));
}

interface RevMetaDto {
  version: number;
  editedBy: number;
  createdAt: string;
  /** 변경 요약(V17) — 선택 입력이라 대개 없다. */
  changeNote?: string | null;
  editedByName?: string | null;
}
export function mapVersionMeta(dto: RevMetaDto, pageId: string): PageVersion {
  return {
    id: `${pageId}:${dto.version}`, pageId, version: dto.version,
    title: "", body: "",
    savedBy: toClientId(dto.editedBy), savedByName: dto.editedByName ?? null, savedAt: dto.createdAt,
    changeNote: dto.changeNote ?? undefined,
  };
}
interface RevFullDto { version: number; title: string; content: string; editedBy: number; editedByName?: string | null }
export function mapVersionFull(dto: RevFullDto, pageId: string, savedAt = ""): PageVersion {
  return {
    id: `${pageId}:${dto.version}`, pageId, version: dto.version,
    title: dto.title, body: dto.content,
    savedBy: toClientId(dto.editedBy), savedByName: dto.editedByName ?? null, savedAt,
  };
}

export function extractError(status: number, body: unknown): string {
  const msg = (body as { error?: string } | null)?.error;
  if (typeof msg === "string" && msg) return msg;
  if (status === 409) return "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.";
  if (status === 403) return "권한이 없습니다.";
  if (status === 404) return "찾을 수 없습니다.";
  return `요청 실패(${status})`;
}

export interface CommentDto {
  id: number;
  pageId: number;
  parentId: number | null;
  authorId: number;
  authorName: string;
  body: string;
  createdAt: string;
  /** 서버의 editedAt — 수정된 적 없으면 null(프론트 "(수정됨)" 표시 근거). */
  updatedAt: string | null;
  /** W21-4 인라인 댓글 — 구버전 응답 호환을 위해 optional. */
  anchorType?: string;
  anchorQuote?: string | null;
  anchorOccurrence?: number | null;
  resolvedAt?: string | null;
  reactions?: Array<{ emoji: string; count: number; reacted: boolean }>;
}

/** 지연 트리 노드 DTO — PageTreeItem + childCount(2026-08-28). */
export interface PageNodeDto extends TreeItemDto {
  childCount: number;
}

export function mapPageNode(dto: PageNodeDto): PageNode {
  return {
    id: toClientId(dto.id),
    parentId: dto.parentId === null || dto.parentId === undefined ? null : toClientId(dto.parentId),
    title: dto.title,
    type: dto.type ?? "page",
    status: dto.status ?? "published",
    position: dto.position ?? 0,
    icon: dto.icon ?? null,
    updatedBy: dto.updatedBy === null || dto.updatedBy === undefined ? undefined : toClientId(dto.updatedBy),
    updatedAt: dto.updatedAt ?? undefined,
    childCount: dto.childCount ?? 0,
  };
}

export function mapComment(dto: CommentDto): Comment {
  return {
    id: toClientId(dto.id),
    pageId: toClientId(dto.pageId),
    parentId: dto.parentId === null || dto.parentId === undefined ? null : toClientId(dto.parentId),
    authorId: toClientId(dto.authorId),
    authorName: dto.authorName,
    body: dto.body,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt ?? null,
    anchorType: dto.anchorType === "inline" ? "inline" : "page",
    anchorQuote: dto.anchorQuote ?? null,
    anchorOccurrence: dto.anchorOccurrence ?? null,
    resolvedAt: dto.resolvedAt ?? null,
    reactions: dto.reactions ?? [],
  };
}

// ── 마이그레이션(M1) ─────────────────────────────────────────
// 백엔드는 id를 Long으로 준다 — 문자열 변환은 **이 경계에서만** 한다(설계 §2).
// 집계 맵의 키(PENDING·EXTRACT…)는 enum 이름 그대로 통과시킨다.

export interface MigrationSourceDto {
  baseUrl: string;
  spaceKey: string;
  spaceName?: string | null;
  discoveredCount?: number | null;
}

export interface MigrationJobDto {
  id: number;
  provider: MigrationProvider;
  sourceInstanceId?: string | null;
  targetSpaceId: number;
  mode: MigrationMode;
  status: MigrationJobStatus;
  itemCount?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  /** §1.3 확장. 구버전 응답에는 없다 — 토큰은 어떤 경우에도 오지 않는다. */
  source?: MigrationSourceDto | null;
  counts?: { byStatus?: Record<string, number>; byStage?: Record<string, number> } | null;
  /** 잡 단위 손실. 서버는 항상 배열(대개 빈 배열)을 주지만 구버전 응답에는 필드가 없다. */
  jobIssues?: MigrationJobIssue[] | null;
}

export interface MigrationJobSummaryDto {
  id: number;
  provider: MigrationProvider;
  targetSpaceId: number;
  mode: MigrationMode;
  status: MigrationJobStatus;
  createdAt?: string | null;
  discoveredCount?: number | null;
  sourceSpaceKey?: string | null;
}

export interface MigrationItemDto {
  id: number;
  jobId: number;
  externalObjectId: string;
  sourceVersion?: string | null;
  stage: MigrationStage;
  status: MigrationItemStatus;
  retryCount?: number | null;
  nextAttemptAt?: string | null;
  targetPageId?: number | null;
  lastErrorCode?: string | null;
}

export interface MigrationDeadLetterDto {
  itemId: number;
  externalObjectId: string;
  stage: MigrationStage;
  lastErrorCode?: string | null;
  retryCount?: number | null;
  deadLetteredAt?: string | null;
}

export interface MigrationReportDto {
  job: MigrationJobDto;
  itemsByStatus?: Record<string, number> | null;
  itemsByStage?: Record<string, number> | null;
  issues?: MigrationIssueSummary[] | null;
  deadLetters?: MigrationDeadLetterDto[] | null;
}

export function mapMigrationSource(dto: MigrationSourceDto | null | undefined): MigrationSourceSummary | null {
  if (!dto) return null;
  return {
    baseUrl: dto.baseUrl,
    spaceKey: dto.spaceKey,
    spaceName: dto.spaceName ?? null,
    discoveredCount: dto.discoveredCount ?? 0,
  };
}

export function mapMigrationJob(dto: MigrationJobDto): MigrationJob {
  return {
    id: toClientId(dto.id),
    provider: dto.provider,
    sourceInstanceId: dto.sourceInstanceId ?? null,
    targetSpaceId: toClientId(dto.targetSpaceId),
    mode: dto.mode,
    status: dto.status,
    itemCount: dto.itemCount ?? 0,
    startedAt: dto.startedAt ?? null,
    completedAt: dto.completedAt ?? null,
    createdAt: dto.createdAt ?? null,
    source: mapMigrationSource(dto.source),
    counts: {
      byStatus: dto.counts?.byStatus ?? {},
      byStage: dto.counts?.byStage ?? {},
    },
    // 필드가 없는 구버전 응답과 "손실이 없다"를 같게 다룬다 — 화면은 둘 다 섹션을 그리지 않는다.
    jobIssues: (dto.jobIssues ?? []).map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      sourcePath: issue.sourcePath,
      occurrences: issue.occurrences ?? 0,
    })),
  };
}

export function mapMigrationJobSummary(dto: MigrationJobSummaryDto): MigrationJobSummary {
  return {
    id: toClientId(dto.id),
    provider: dto.provider,
    targetSpaceId: toClientId(dto.targetSpaceId),
    mode: dto.mode,
    status: dto.status,
    createdAt: dto.createdAt ?? null,
    discoveredCount: dto.discoveredCount ?? 0,
    sourceSpaceKey: dto.sourceSpaceKey ?? null,
  };
}

export function mapMigrationItem(dto: MigrationItemDto): MigrationItem {
  return {
    id: toClientId(dto.id),
    jobId: toClientId(dto.jobId),
    externalObjectId: dto.externalObjectId,
    sourceVersion: dto.sourceVersion ?? null,
    stage: dto.stage,
    status: dto.status,
    retryCount: dto.retryCount ?? 0,
    nextAttemptAt: dto.nextAttemptAt ?? null,
    targetPageId: dto.targetPageId === null || dto.targetPageId === undefined ? null : toClientId(dto.targetPageId),
    lastErrorCode: dto.lastErrorCode ?? null,
  };
}

export function mapMigrationDeadLetter(dto: MigrationDeadLetterDto): MigrationDeadLetter {
  return {
    itemId: toClientId(dto.itemId),
    externalObjectId: dto.externalObjectId,
    stage: dto.stage,
    lastErrorCode: dto.lastErrorCode ?? null,
    retryCount: dto.retryCount ?? 0,
    deadLetteredAt: dto.deadLetteredAt ?? null,
  };
}

export function mapMigrationReport(dto: MigrationReportDto): MigrationReport {
  return {
    job: mapMigrationJob(dto.job),
    itemsByStatus: dto.itemsByStatus ?? {},
    itemsByStage: dto.itemsByStage ?? {},
    issues: (dto.issues ?? []).map((i) => ({ ...i, sampleSourcePath: i.sampleSourcePath ?? null })),
    deadLetters: (dto.deadLetters ?? []).map(mapMigrationDeadLetter),
  };
}
