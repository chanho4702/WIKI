import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

/**
 * REST 어댑터를 계약(설계 §1.3)에 고정한다 — 실서버 없이 fetch를 스텁으로 갈아 끼운다.
 * 가장 중요한 것은 **토큰이 요청 본문에만 실린다**는 것이다: 경로·쿼리에 실으면 접근 로그와
 * 리퍼러에 남고, 응답 매핑이 토큰을 읽으면 나중에 어딘가에 저장될 길이 열린다.
 */

function mockSeq(responses: Array<{ status: number; body: unknown }>) {
  const spy = vi.spyOn(client, "sharedApiFetch");
  for (const r of responses) {
    spy.mockResolvedValueOnce(
      new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return spy;
}
afterEach(() => vi.restoreAllMocks());

const bodyOf = (call: [string, RequestInit?]) => JSON.parse(call[1]!.body as string) as Record<string, unknown>;

/** 백엔드 MigrationJobDetailResponse의 최소 형태. */
const jobDto = (extra: Record<string, unknown> = {}) => ({
  id: 42,
  provider: "CONFLUENCE_DC",
  sourceInstanceId: "confluence.example.com",
  targetSpaceId: 5,
  mode: "DRY_RUN",
  status: "PENDING",
  itemCount: 0,
  startedAt: null,
  completedAt: null,
  createdAt: "2026-09-05T00:00:00Z",
  ...extra,
});

describe("wikiApi 마이그레이션 — 연결 확인", () => {
  it("토큰은 POST 본문으로만 가고 응답에서 읽지 않는다", async () => {
    const spy = mockSeq([
      { status: 200, body: { spaceName: "제품 문서", homepageId: "16777217", pageCount: 12 } },
    ]);
    const { probeConfluenceDc } = await import("./wikiApi");

    const probe = await probeConfluenceDc({
      baseUrl: " https://confluence.example.com ",
      spaceKey: " DOCS ",
      token: "pat-secret",
    });

    expect(spy.mock.calls[0][0]).toBe("/api/migration/confluence-dc/probe");
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "POST" });
    // 경로에는 토큰이 없다 — 접근 로그에 남으면 안 된다
    expect(spy.mock.calls[0][0]).not.toContain("pat-secret");
    expect(bodyOf(spy.mock.calls[0])).toEqual({
      baseUrl: "https://confluence.example.com",
      spaceKey: "DOCS",
      token: "pat-secret",
    });
    expect(probe).toEqual({ spaceName: "제품 문서", homepageId: "16777217", pageCount: 12 });
    expect(JSON.stringify(probe)).not.toContain("pat-secret");
  });

  it("총 개수를 못 센 응답은 null로 읽는다(0건과 구분)", async () => {
    mockSeq([{ status: 200, body: { spaceName: "제품 문서", homepageId: null, pageCount: null } }]);
    const { probeConfluenceDc } = await import("./wikiApi");

    const probe = await probeConfluenceDc({ baseUrl: "https://c.example.com", spaceKey: "DOCS", token: "t" });
    expect(probe.pageCount).toBeNull();
    expect(probe.homepageId).toBeNull();
  });

  it("서버 오류 문구를 그대로 던진다", async () => {
    mockSeq([{ status: 401, body: { error: "원본 인증에 실패했습니다 (DC_AUTH)" } }]);
    const { probeConfluenceDc } = await import("./wikiApi");

    await expect(
      probeConfluenceDc({ baseUrl: "https://c.example.com", spaceKey: "DOCS", token: "t" }),
    ).rejects.toThrow("원본 인증에 실패했습니다 (DC_AUTH)");
  });
});

describe("wikiApi 마이그레이션 — 잡", () => {
  it("목록은 GET, 403이면 null(전역 관리자 아님)", async () => {
    const spy = mockSeq([
      {
        status: 200,
        body: [
          {
            id: 42,
            provider: "CONFLUENCE_DC",
            targetSpaceId: 5,
            mode: "IMPORT",
            status: "RUNNING",
            createdAt: "2026-09-05T00:00:00Z",
            discoveredCount: 12,
            sourceSpaceKey: "DOCS",
          },
        ],
      },
      { status: 403, body: { error: "권한이 없습니다." } },
    ]);
    const { listMigrationJobs } = await import("./wikiApi");

    const rows = await listMigrationJobs();
    expect(spy.mock.calls[0][0]).toBe("/api/migration");
    expect(rows).toEqual([
      {
        id: "42",
        provider: "CONFLUENCE_DC",
        targetSpaceId: "5",
        mode: "IMPORT",
        status: "RUNNING",
        createdAt: "2026-09-05T00:00:00Z",
        discoveredCount: 12,
        sourceSpaceKey: "DOCS",
      },
    ]);

    expect(await listMigrationJobs()).toBeNull();
  });

  it("원본이 없는 예전 잡도 읽는다", async () => {
    mockSeq([
      {
        status: 200,
        body: [
          {
            id: 7,
            provider: "NOTION",
            targetSpaceId: 5,
            mode: "DRY_RUN",
            status: "COMPLETED",
            createdAt: null,
            discoveredCount: null,
            sourceSpaceKey: null,
          },
        ],
      },
    ]);
    const { listMigrationJobs } = await import("./wikiApi");

    const rows = await listMigrationJobs();
    expect(rows![0]).toMatchObject({ discoveredCount: 0, sourceSpaceKey: null, createdAt: null });
  });

  it("잡 생성은 source를 본문에 담고 targetSpaceId를 숫자로 보낸다", async () => {
    const spy = mockSeq([{ status: 201, body: jobDto() }]);
    const { createMigrationJob } = await import("./wikiApi");

    const job = await createMigrationJob({
      provider: "CONFLUENCE_DC",
      targetSpaceId: "5",
      mode: "DRY_RUN",
      source: { baseUrl: "https://confluence.example.com", spaceKey: "DOCS", token: "pat-secret" },
    });

    expect(spy.mock.calls[0][0]).toBe("/api/migration");
    expect(bodyOf(spy.mock.calls[0])).toEqual({
      provider: "CONFLUENCE_DC",
      targetSpaceId: 5,
      mode: "DRY_RUN",
      source: { baseUrl: "https://confluence.example.com", spaceKey: "DOCS", token: "pat-secret" },
    });
    // 응답에는 토큰이 없다 — 매퍼가 읽는 필드에도 자리가 없다
    expect(JSON.stringify(job)).not.toContain("pat-secret");
    expect(job.id).toBe("42");
    expect(job.targetSpaceId).toBe("5");
  });

  it("counts·source가 없는 응답(생성·시작·취소)도 빈 집계로 읽는다", async () => {
    mockSeq([{ status: 200, body: jobDto({ status: "RUNNING" }) }]);
    const { startMigrationJob } = await import("./wikiApi");

    const job = await startMigrationJob("42");
    expect(job.source).toBeNull();
    expect(job.counts).toEqual({ byStatus: {}, byStage: {} });
  });

  it("발견·시작·취소는 POST, 상세는 GET", async () => {
    const spy = mockSeq([
      { status: 200, body: { discovered: 12, enqueued: 12, skipped: 0 } },
      { status: 200, body: jobDto({ status: "RUNNING" }) },
      { status: 200, body: jobDto({ status: "CANCELLED" }) },
      {
        status: 200,
        body: jobDto({
          status: "RUNNING",
          itemCount: 12,
          source: { baseUrl: "https://confluence.example.com", spaceKey: "DOCS", spaceName: "제품 문서", discoveredCount: 12 },
          counts: { byStatus: { COMPLETED: 3, PENDING: 9 }, byStage: { DONE: 3, EXTRACT: 9 } },
        }),
      },
    ]);
    const { cancelMigrationJob, discoverMigrationJob, getMigrationJob, startMigrationJob } =
      await import("./wikiApi");

    expect(await discoverMigrationJob("42")).toEqual({ discovered: 12, enqueued: 12, skipped: 0 });
    expect(spy.mock.calls[0][0]).toBe("/api/migration/42/discover");
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "POST" });

    await startMigrationJob("42");
    expect(spy.mock.calls[1][0]).toBe("/api/migration/42/start");

    await cancelMigrationJob("42");
    expect(spy.mock.calls[2][0]).toBe("/api/migration/42/cancel");

    const job = await getMigrationJob("42");
    expect(spy.mock.calls[3][0]).toBe("/api/migration/42");
    expect(job.source).toEqual({
      baseUrl: "https://confluence.example.com",
      spaceKey: "DOCS",
      spaceName: "제품 문서",
      discoveredCount: 12,
    });
    expect(job.counts.byStatus.COMPLETED).toBe(3);
  });

  /**
   * 서버 집계는 group-by라 **0인 키를 담지 않는다**(백엔드 계약 §4.1). 아직 아무것도 끝나지 않은
   * 잡은 `{PENDING: 12}`만 온다 — 화면은 없는 키를 0으로 읽어야 하고, 매퍼는 그 맵을 손대지 않는다.
   */
  it("아직 도달하지 않은 상태·단계는 집계 키 자체가 없다", async () => {
    mockSeq([
      {
        status: 200,
        body: jobDto({
          itemCount: 12,
          counts: { byStatus: { PENDING: 12 }, byStage: { EXTRACT: 12 } },
        }),
      },
    ]);
    const { getMigrationJob } = await import("./wikiApi");

    const job = await getMigrationJob("42");
    expect(job.counts.byStatus).toEqual({ PENDING: 12 });
    expect(job.counts.byStatus.COMPLETED).toBeUndefined();
    // 화면이 진행률을 내는 방식과 같은 계산 — 없는 키를 그대로 나누면 NaN%가 된다
    expect((job.counts.byStatus.COMPLETED ?? 0) / job.itemCount).toBe(0);
  });

  it("발견 없이 시작하면 서버 400 문구가 그대로 올라온다", async () => {
    mockSeq([{ status: 400, body: { error: "발견된 항목이 없습니다 (MIGRATION_NOTHING_DISCOVERED)" } }]);
    const { startMigrationJob } = await import("./wikiApi");

    await expect(startMigrationJob("42")).rejects.toThrow("MIGRATION_NOTHING_DISCOVERED");
  });
});

describe("wikiApi 마이그레이션 — 보고서·항목", () => {
  it("보고서는 집계·손실·데드레터를 매핑한다", async () => {
    const spy = mockSeq([
      {
        status: 200,
        body: {
          job: jobDto({ status: "COMPLETED", itemCount: 12 }),
          itemsByStatus: { COMPLETED: 11, DEAD_LETTER: 1 },
          itemsByStage: { DONE: 11, EXTRACT: 1 },
          issues: [
            { severity: "WARNING", code: "MACRO_OPAQUE", distinctPaths: 2, occurrences: 5 },
            { severity: "ERROR", code: "IR_INVALID", distinctPaths: 1, occurrences: 1, sampleSourcePath: "body.storage" },
          ],
          deadLetters: [
            {
              itemId: 901,
              externalObjectId: "100012",
              stage: "EXTRACT",
              lastErrorCode: "DC_NOT_FOUND",
              retryCount: 3,
              deadLetteredAt: "2026-09-05T01:00:00Z",
            },
          ],
        },
      },
    ]);
    const { getMigrationReport } = await import("./wikiApi");

    const report = await getMigrationReport("42");
    expect(spy.mock.calls[0][0]).toBe("/api/migration/42/report");
    expect(report.job.id).toBe("42");
    expect(report.itemsByStatus.COMPLETED).toBe(11);
    // sampleSourcePath는 선택이다 — 서버가 안 주면 null이고 화면은 "-"로 그린다
    expect(report.issues[0].sampleSourcePath).toBeNull();
    expect(report.issues[1].sampleSourcePath).toBe("body.storage");
    expect(report.deadLetters[0]).toEqual({
      itemId: "901",
      externalObjectId: "100012",
      stage: "EXTRACT",
      lastErrorCode: "DC_NOT_FOUND",
      retryCount: 3,
      deadLetteredAt: "2026-09-05T01:00:00Z",
    });
  });

  it("필드가 빠진 보고서도 빈 값으로 읽는다", async () => {
    mockSeq([{ status: 200, body: { job: jobDto() } }]);
    const { getMigrationReport } = await import("./wikiApi");

    const report = await getMigrationReport("42");
    expect(report.issues).toEqual([]);
    expect(report.deadLetters).toEqual([]);
    expect(report.itemsByStatus).toEqual({});
  });

  it("항목 목록은 status·stage·page를 쿼리로 보낸다", async () => {
    const spy = mockSeq([
      {
        status: 200,
        body: {
          items: [
            {
              id: 901,
              jobId: 42,
              externalObjectId: "100012",
              sourceVersion: "3",
              stage: "EXTRACT",
              status: "DEAD_LETTER",
              retryCount: 3,
              nextAttemptAt: null,
              targetPageId: null,
              lastErrorCode: "DC_NOT_FOUND",
            },
          ],
          page: 1,
          size: 50,
          total: 1,
        },
      },
      { status: 200, body: { items: [], page: 0, size: 50, total: 0 } },
    ]);
    const { listMigrationItems } = await import("./wikiApi");

    const page = await listMigrationItems("42", { status: "DEAD_LETTER", stage: "EXTRACT", page: 1 });
    expect(spy.mock.calls[0][0]).toBe("/api/migration/42/items?status=DEAD_LETTER&stage=EXTRACT&page=1");
    expect(page.items[0]).toMatchObject({ id: "901", jobId: "42", targetPageId: null });
    expect(page.total).toBe(1);

    // 필터가 없으면 쿼리 자체를 붙이지 않는다
    await listMigrationItems("42");
    expect(spy.mock.calls[1][0]).toBe("/api/migration/42/items");
  });

  it("targetPageId가 있는 항목은 문자열 id로 읽는다", async () => {
    mockSeq([
      {
        status: 200,
        body: {
          items: [
            {
              id: 902,
              jobId: 42,
              externalObjectId: "100001",
              stage: "DONE",
              status: "COMPLETED",
              targetPageId: 777,
            },
          ],
          page: 0,
          size: 50,
          total: 1,
        },
      },
    ]);
    const { listMigrationItems } = await import("./wikiApi");

    const page = await listMigrationItems("42");
    expect(page.items[0].targetPageId).toBe("777");
    expect(page.items[0].sourceVersion).toBeNull();
    expect(page.items[0].retryCount).toBe(0);
  });
});
