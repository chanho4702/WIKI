// 컨플루언스 DC 이관(M1) 목업 — 폴링 횟수로 진행하는 고정 시나리오.
import type {
  MigrationDeadLetter,
  MigrationDiscoverResult,
  MigrationIssueSummary,
  MigrationItem,
  MigrationItemFilter,
  MigrationItemPage,
  MigrationJob,
  MigrationJobIssue,
  MigrationJobRecord,
  MigrationJobSummary,
  MigrationLinkFixupResult,
  MigrationMode,
  MigrationProvider,
  MigrationReport,
  MigrationSourceInput,
  MigrationSourceProbe,
  WikiData,
} from "../types";
import { clone, load, nextId, persist } from "./db";

/** 발견되는 원본 페이지 수 — 12건. */
const MOCK_DISCOVERED = 12;

/** 폴링 한 번에 처리되는 항목 수. */
const MOCK_ITEMS_PER_TICK = 3;

/** 몇 번째 항목이 어떤 경고를 남기는가(1부터). 항목이 처리돼야 보고서에 나타난다. */
const MOCK_ISSUE_BY_ORDINAL: Record<number, { code: string; sourcePath: string }> = {
  3: { code: "MACRO_OPAQUE", sourcePath: "macro:jira" },
  7: { code: "ATTACHMENT_NOT_COPIED", sourcePath: "attachment:설계도.png" },
};

/** 원본에서 사라진 페이지 — 재시도해도 안 되는 데드레터 한 건. */
const MOCK_DEAD_LETTER_ORDINAL = MOCK_DISCOVERED;

/**
 * 잡이 끝난 뒤 도는 링크 정리가 문서 하나를 못 고친 상태 — 항목 표에도 손실 보고서에도 나오지
 * 않는 손실이라 상세 화면의 "잡 이슈"에서만 보인다. 링크 정리를 다시 돌리면 사라진다.
 */
const MOCK_LINK_FIXUP_ISSUE = (): MigrationJobIssue => ({
  severity: "ERROR",
  code: "LINK_FIXUP_FAILED",
  sourcePath: "page:1042",
  occurrences: 1,
});

function migrationsOf(data: WikiData): MigrationJobRecord[] {
  return (data.migrations ??= []);
}

function findMigration(data: WikiData, id: string): MigrationJobRecord {
  const found = migrationsOf(data).find((j) => j.id === id);
  if (!found) throw new Error("마이그레이션 잡을 찾을 수 없습니다");
  return found;
}

/** 항목 순번 — externalObjectId가 아니라 배열 위치로 센다. */
function ordinalOf(record: MigrationJobRecord, item: MigrationItem): number {
  return record.items.indexOf(item) + 1;
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function migrationJobView(record: MigrationJobRecord): MigrationJob {
  return clone({
    id: record.id,
    provider: record.provider,
    sourceInstanceId: record.sourceInstanceId,
    targetSpaceId: record.targetSpaceId,
    mode: record.mode,
    status: record.status,
    itemCount: record.items.length,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
    source: record.source,
    counts: {
      byStatus: countBy(record.items.map((i) => i.status)),
      byStage: countBy(record.items.map((i) => i.stage)),
    },
    jobIssues: record.jobIssues ?? [],
  });
}

/** 처리된 항목에서 손실을 집계한다 — 심각도(ERROR→WARNING→INFO) 다음 code 순. */
function migrationIssues(record: MigrationJobRecord): MigrationIssueSummary[] {
  const byCode = new Map<string, MigrationIssueSummary>();
  for (const item of record.items) {
    if (item.status !== "COMPLETED") continue;
    const issue = MOCK_ISSUE_BY_ORDINAL[ordinalOf(record, item)];
    if (!issue) continue;
    const found = byCode.get(issue.code);
    if (found) {
      found.distinctPaths += 1;
      found.occurrences += 1;
    } else {
      byCode.set(issue.code, {
        severity: "WARNING",
        code: issue.code,
        distinctPaths: 1,
        occurrences: 1,
        sampleSourcePath: issue.sourcePath,
      });
    }
  }
  const rank: Record<MigrationIssueSummary["severity"], number> = { ERROR: 0, WARNING: 1, INFO: 2 };
  return [...byCode.values()].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code),
  );
}

function migrationDeadLetters(record: MigrationJobRecord): MigrationDeadLetter[] {
  return record.items
    .filter((item) => item.status === "DEAD_LETTER")
    .map((item) => ({
      itemId: item.id,
      externalObjectId: item.externalObjectId,
      stage: item.stage,
      lastErrorCode: item.lastErrorCode,
      retryCount: item.retryCount,
      deadLetteredAt: item.nextAttemptAt,
    }));
}

/**
 * 폴링 한 번 분량을 진행시킨다. RUNNING이 아니면(아직 시작 전·취소·완료) 아무것도 하지 않는다 —
 * 취소한 잡이 조회만으로 다시 굴러가면 취소가 취소가 아니다.
 */
function advanceMigration(record: MigrationJobRecord): boolean {
  if (record.status !== "RUNNING") return false;
  let moved = 0;
  for (const item of record.items) {
    if (moved >= MOCK_ITEMS_PER_TICK) break;
    if (item.status !== "PENDING") continue;
    const ordinal = ordinalOf(record, item);
    if (ordinal === MOCK_DEAD_LETTER_ORDINAL) {
      item.status = "DEAD_LETTER";
      item.stage = "EXTRACT";
      item.retryCount = 3;
      item.lastErrorCode = "DC_NOT_FOUND";
      item.nextAttemptAt = new Date().toISOString();
    } else {
      item.status = "COMPLETED";
      item.stage = "DONE";
      // dry-run은 페이지를 만들지 않는다 — 보고서만 남는다(설계 §1.4 RESOLVE).
      item.targetPageId = record.mode === "IMPORT" ? `mig-${record.id}-${ordinal}` : null;
    }
    moved += 1;
  }
  if (record.items.every((item) => item.status === "COMPLETED" || item.status === "DEAD_LETTER")) {
    record.status = "COMPLETED";
    record.completedAt = new Date().toISOString();
    // 링크 정리는 잡이 끝난 뒤에 돈다. 실제 이관에서만 문서가 있으므로 시험 실행에는 남길 실패가 없다.
    if (record.mode === "IMPORT") record.jobIssues = [MOCK_LINK_FIXUP_ISSUE()];
  }
  return moved > 0;
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/** 연결 확인(M-01). 토큰은 **여기서 소비하고 버린다** — 어디에도 저장하지 않는다. */
export async function probeConfluenceDc(input: MigrationSourceInput): Promise<MigrationSourceProbe> {
  if (!/^https?:\/\//.test(input.baseUrl.trim())) {
    throw new Error("원본 주소는 http:// 또는 https://로 시작해야 합니다");
  }
  if (!input.spaceKey.trim()) throw new Error("스페이스 키를 입력하세요");
  if (!input.token.trim()) throw new Error("접근 토큰을 입력하세요");
  return { spaceName: "제품 문서", homepageId: "16777217", pageCount: MOCK_DISCOVERED };
}

/**
 * 잡 목록. 백엔드 모드는 전역 관리자가 아니면 null(403)을 주지만, 목업에는 판정할 서버가
 * 없으므로 항상 목록을 준다 — 화면은 null만 "권한 없음"으로 다룬다.
 */
export async function listMigrationJobs(): Promise<MigrationJobSummary[] | null> {
  const data = load();
  // 같은 밀리초에 만든 잡은 createdAt이 같다 — 뒤에 넣은 것이 새 것이므로 뒤집고 나서 안정 정렬한다.
  return [...migrationsOf(data)]
    .reverse()
    .map((record) => ({
      id: record.id,
      provider: record.provider,
      targetSpaceId: record.targetSpaceId,
      mode: record.mode,
      status: record.status,
      createdAt: record.createdAt,
      discoveredCount: record.source?.discoveredCount ?? record.items.length,
      sourceSpaceKey: record.source?.spaceKey ?? null,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 50);
}

export async function createMigrationJob(input: {
  provider: MigrationProvider;
  targetSpaceId: string;
  mode: MigrationMode;
  source?: MigrationSourceInput;
}): Promise<MigrationJob> {
  const data = load();
  if (!data.spaces.some((s) => s.id === input.targetSpaceId)) {
    throw new Error("대상 스페이스를 찾을 수 없습니다");
  }
  if (input.provider === "CONFLUENCE_DC" && !input.source) {
    throw new Error("원본 접속 정보가 필요합니다");
  }
  const record: MigrationJobRecord = {
    id: nextId(),
    provider: input.provider,
    // 서버는 baseUrl 호스트로 채운다 — 목업도 같은 규칙을 흉내낸다.
    sourceInstanceId: input.source ? hostOf(input.source.baseUrl) : null,
    targetSpaceId: input.targetSpaceId,
    mode: input.mode,
    status: "PENDING",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    // token은 담지 않는다 — 저장 형태에 자리조차 없다.
    source: input.source
      ? { baseUrl: input.source.baseUrl, spaceKey: input.source.spaceKey, spaceName: null, discoveredCount: 0 }
      : null,
    items: [],
  };
  migrationsOf(data).push(record);
  persist();
  return migrationJobView(record);
}

/** 재발견은 멱등이다 — 이미 있는 항목은 skipped로 세고 새 항목만 더한다. */
export async function discoverMigrationJob(id: string): Promise<MigrationDiscoverResult> {
  const data = load();
  const record = findMigration(data, id);
  if (record.status !== "PENDING") throw new Error("이미 시작한 잡은 다시 발견할 수 없습니다");
  let enqueued = 0;
  let skipped = 0;
  for (let ordinal = 1; ordinal <= MOCK_DISCOVERED; ordinal += 1) {
    const externalObjectId = String(100000 + ordinal);
    if (record.items.some((item) => item.externalObjectId === externalObjectId)) {
      skipped += 1;
      continue;
    }
    record.items.push({
      id: `${record.id}-${ordinal}`,
      jobId: record.id,
      externalObjectId,
      sourceVersion: "1",
      stage: "EXTRACT",
      status: "PENDING",
      retryCount: 0,
      nextAttemptAt: null,
      targetPageId: null,
      lastErrorCode: null,
    });
    enqueued += 1;
  }
  if (record.source) {
    record.source.spaceName = "제품 문서";
    record.source.discoveredCount = record.items.length;
  }
  persist();
  return { discovered: MOCK_DISCOVERED, enqueued, skipped };
}

export async function startMigrationJob(id: string): Promise<MigrationJob> {
  const data = load();
  const record = findMigration(data, id);
  // 발견 없이 시작하면 서버는 400 MIGRATION_NOTHING_DISCOVERED를 준다(설계 §1.3).
  if (record.items.length === 0) throw new Error("발견된 항목이 없습니다. 먼저 원본을 발견하세요");
  if (record.status !== "PENDING") throw new Error("이미 시작한 잡입니다");
  record.status = "RUNNING";
  record.startedAt = new Date().toISOString();
  persist();
  return migrationJobView(record);
}

export async function cancelMigrationJob(id: string): Promise<MigrationJob> {
  const data = load();
  const record = findMigration(data, id);
  if (record.status === "COMPLETED") throw new Error("이미 끝난 잡은 취소할 수 없습니다");
  record.status = "CANCELLED";
  record.completedAt = new Date().toISOString();
  persist();
  return migrationJobView(record);
}

/** 폴링 진입점 — 이 호출만 시나리오를 진행시킨다. */
export async function getMigrationJob(id: string): Promise<MigrationJob> {
  const data = load();
  const record = findMigration(data, id);
  if (advanceMigration(record)) persist();
  return migrationJobView(record);
}

/**
 * 링크 정리 재실행. 이미 정리된 문서에는 임시 링크가 남아 있지 않아 손대지 않으므로 **다시 눌러도
 * 안전하다** — 두 번째 실행의 touched가 0인 것이 곧 "고칠 것이 없다"는 뜻이다.
 * 끝나지 않은 잡에는 정리할 결과가 없어 서버가 409를 준다(같은 문구로 거부한다).
 */
export async function rerunMigrationLinkFixup(id: string): Promise<MigrationLinkFixupResult> {
  const data = load();
  const record = findMigration(data, id);
  if (record.status !== "COMPLETED" && record.status !== "FAILED") {
    throw new Error(`끝난 작업에만 링크 정리를 다시 돌릴 수 있습니다: ${record.status}`);
  }
  const pending = record.jobIssues ?? [];
  record.jobIssues = [];
  persist();
  return { touched: pending.length, failed: 0 };
}

/** 보고서는 상태를 읽기만 한다 — 같은 폴링 안에서 잡과 다른 시점을 보면 안 된다. */
export async function getMigrationReport(id: string): Promise<MigrationReport> {
  const data = load();
  const record = findMigration(data, id);
  const job = migrationJobView(record);
  return {
    job,
    itemsByStatus: job.counts.byStatus,
    itemsByStage: job.counts.byStage,
    issues: migrationIssues(record),
    deadLetters: migrationDeadLetters(record),
  };
}

export async function listMigrationItems(
  id: string,
  filter: MigrationItemFilter = {},
): Promise<MigrationItemPage> {
  const data = load();
  const record = findMigration(data, id);
  const matched = record.items.filter(
    (item) =>
      (filter.status === undefined || item.status === filter.status) &&
      (filter.stage === undefined || item.stage === filter.stage),
  );
  const page = Math.max(filter.page ?? 0, 0);
  const size = 50;
  return {
    items: clone(matched.slice(page * size, (page + 1) * size)),
    page,
    size,
    total: matched.length,
  };
}
