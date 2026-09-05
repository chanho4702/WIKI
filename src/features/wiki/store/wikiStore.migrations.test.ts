import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  cancelMigrationJob,
  createMigrationJob,
  discoverMigrationJob,
  getMigrationJob,
  getMigrationReport,
  listMigrationItems,
  listMigrationJobs,
  probeConfluenceDc,
  rerunMigrationLinkFixup,
  startMigrationJob,
} from "./wikiStore";
import { createSeedData } from "../../../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

const SOURCE = { baseUrl: "https://confluence.example.com", spaceKey: "DOCS", token: "pat-secret" };

async function makeJob(mode: "DRY_RUN" | "IMPORT" = "IMPORT") {
  return createMigrationJob({ provider: "CONFLUENCE_DC", targetSpaceId: "sp1", mode, source: SOURCE });
}

describe("마이그레이션 목업 시나리오 (M1)", () => {
  it("연결 확인은 스페이스 이름과 페이지 수를 준다", async () => {
    const probe = await probeConfluenceDc(SOURCE);

    expect(probe.spaceName).toBe("제품 문서");
    expect(probe.pageCount).toBe(12);
  });

  it("주소·키·토큰이 비면 연결 확인이 거부한다", async () => {
    await expect(probeConfluenceDc({ ...SOURCE, baseUrl: "confluence.example.com" })).rejects.toThrow(
      "http:// 또는 https://",
    );
    await expect(probeConfluenceDc({ ...SOURCE, spaceKey: "  " })).rejects.toThrow("스페이스 키");
    await expect(probeConfluenceDc({ ...SOURCE, token: "" })).rejects.toThrow("접근 토큰");
  });

  /** 토큰이 저장에도 응답에도 남으면 안 된다 — 화면이 아니라 스토어가 지키는 계약이다. */
  it("잡을 만들어도 토큰은 어디에도 남지 않는다", async () => {
    const job = await makeJob();

    expect(JSON.stringify(job)).not.toContain("pat-secret");
    expect(localStorage.getItem("wiki.v1")).not.toContain("pat-secret");
    expect(job.source).toMatchObject({ baseUrl: SOURCE.baseUrl, spaceKey: "DOCS", discoveredCount: 0 });
  });

  it("대상 스페이스가 없으면 만들지 않는다", async () => {
    await expect(
      createMigrationJob({ provider: "CONFLUENCE_DC", targetSpaceId: "없는스페이스", mode: "DRY_RUN", source: SOURCE }),
    ).rejects.toThrow("대상 스페이스");
  });

  it("발견은 12건을 담고, 다시 눌러도 새로 담지 않는다(멱등)", async () => {
    const job = await makeJob();

    expect(await discoverMigrationJob(job.id)).toEqual({ discovered: 12, enqueued: 12, skipped: 0 });
    expect(await discoverMigrationJob(job.id)).toEqual({ discovered: 12, enqueued: 0, skipped: 12 });

    const after = await getMigrationJob(job.id);
    expect(after.itemCount).toBe(12);
    expect(after.source?.discoveredCount).toBe(12);
    expect(after.source?.spaceName).toBe("제품 문서");
  });

  it("발견 없이 시작하면 거부한다", async () => {
    const job = await makeJob();

    await expect(startMigrationJob(job.id)).rejects.toThrow("발견된 항목이 없습니다");
  });

  it("폴링마다 3건씩 나아가고 12건에서 끝난다", async () => {
    const job = await makeJob();
    await discoverMigrationJob(job.id);
    await startMigrationJob(job.id);

    const first = await getMigrationJob(job.id);
    expect(first.status).toBe("RUNNING");
    expect(first.counts.byStatus.COMPLETED).toBe(3);
    expect(first.counts.byStatus.PENDING).toBe(9);

    expect((await getMigrationJob(job.id)).counts.byStatus.COMPLETED).toBe(6);
    expect((await getMigrationJob(job.id)).counts.byStatus.COMPLETED).toBe(9);

    // 마지막 틱 — 12번째 항목만 데드레터로 떨어진다
    const last = await getMigrationJob(job.id);
    expect(last.status).toBe("COMPLETED");
    expect(last.counts.byStatus.COMPLETED).toBe(11);
    expect(last.counts.byStatus.DEAD_LETTER).toBe(1);
    expect(last.itemCount).toBe(12);
  });

  it("보고서는 경고 2종과 데드레터 1건을 낸다", async () => {
    const job = await makeJob();
    await discoverMigrationJob(job.id);
    await startMigrationJob(job.id);
    for (let tick = 0; tick < 4; tick += 1) await getMigrationJob(job.id);

    const report = await getMigrationReport(job.id);

    expect(report.issues.map((i) => i.code)).toEqual(["ATTACHMENT_NOT_COPIED", "MACRO_OPAQUE"]);
    expect(report.issues.every((i) => i.severity === "WARNING")).toBe(true);
    expect(report.issues.find((i) => i.code === "MACRO_OPAQUE")?.sampleSourcePath).toBe("macro:jira");
    expect(report.deadLetters).toHaveLength(1);
    expect(report.deadLetters[0]).toMatchObject({ lastErrorCode: "DC_NOT_FOUND", stage: "EXTRACT" });
    expect(report.itemsByStatus.COMPLETED).toBe(11);
  });

  /** 손실은 그 항목이 처리된 뒤에야 보고서에 나타난다 — 시작하자마자 전부 뜨면 진행률이 거짓말이 된다. */
  it("아직 처리하지 않은 항목의 경고는 보고서에 없다", async () => {
    const job = await makeJob();
    await discoverMigrationJob(job.id);
    await startMigrationJob(job.id);
    await getMigrationJob(job.id); // 1~3번만 처리

    const report = await getMigrationReport(job.id);
    expect(report.issues.map((i) => i.code)).toEqual(["MACRO_OPAQUE"]);
    expect(report.deadLetters).toHaveLength(0);
  });

  /** 보고서 조회가 진행을 당기면 같은 폴링 안에서 잡과 보고서가 다른 시점을 가리킨다. */
  it("보고서 조회는 진행을 당기지 않는다", async () => {
    const job = await makeJob();
    await discoverMigrationJob(job.id);
    await startMigrationJob(job.id);

    await getMigrationReport(job.id);
    await getMigrationReport(job.id);

    expect((await getMigrationJob(job.id)).counts.byStatus.COMPLETED).toBe(3);
  });

  it("시험 실행은 페이지를 만들지 않는다", async () => {
    const dry = await makeJob("DRY_RUN");
    await discoverMigrationJob(dry.id);
    await startMigrationJob(dry.id);
    for (let tick = 0; tick < 4; tick += 1) await getMigrationJob(dry.id);

    const items = await listMigrationItems(dry.id, { status: "COMPLETED" });
    expect(items.total).toBe(11);
    expect(items.items.every((item) => item.targetPageId === null)).toBe(true);

    const real = await makeJob("IMPORT");
    await discoverMigrationJob(real.id);
    await startMigrationJob(real.id);
    for (let tick = 0; tick < 4; tick += 1) await getMigrationJob(real.id);

    const imported = await listMigrationItems(real.id, { status: "COMPLETED" });
    expect(imported.items.every((item) => item.targetPageId !== null)).toBe(true);
  });

  /** 취소한 잡이 조회만으로 다시 굴러가면 취소가 취소가 아니다. */
  it("취소한 뒤에는 폴링해도 더 나아가지 않는다", async () => {
    const job = await makeJob();
    await discoverMigrationJob(job.id);
    await startMigrationJob(job.id);
    await getMigrationJob(job.id);

    const cancelled = await cancelMigrationJob(job.id);
    expect(cancelled.status).toBe("CANCELLED");

    const after = await getMigrationJob(job.id);
    expect(after.status).toBe("CANCELLED");
    expect(after.counts.byStatus.COMPLETED).toBe(3);
  });

  /** 링크 정리는 잡이 끝난 뒤에 돈다 — 그전에는 잡 이슈가 없다. */
  it("실제 이관이 끝나면 링크 정리 실패가 잡 이슈로 남는다", async () => {
    const job = await makeJob();
    await discoverMigrationJob(job.id);
    await startMigrationJob(job.id);

    expect((await getMigrationJob(job.id)).jobIssues).toEqual([]);

    for (let tick = 0; tick < 3; tick += 1) await getMigrationJob(job.id);
    const done = await getMigrationJob(job.id);

    expect(done.status).toBe("COMPLETED");
    expect(done.jobIssues).toEqual([
      { severity: "ERROR", code: "LINK_FIXUP_FAILED", sourcePath: "page:1042", occurrences: 1 },
    ]);
  });

  /** 시험 실행은 문서를 만들지 않으니 고칠 링크도 없다. */
  it("시험 실행에는 잡 이슈가 남지 않는다", async () => {
    const dry = await makeJob("DRY_RUN");
    await discoverMigrationJob(dry.id);
    await startMigrationJob(dry.id);
    for (let tick = 0; tick < 4; tick += 1) await getMigrationJob(dry.id);

    expect((await getMigrationJob(dry.id)).jobIssues).toEqual([]);
  });

  it("링크 정리 재실행은 잡 이슈를 지우고, 다시 돌리면 고칠 것이 없다", async () => {
    const job = await makeJob();
    await discoverMigrationJob(job.id);
    await startMigrationJob(job.id);
    for (let tick = 0; tick < 4; tick += 1) await getMigrationJob(job.id);

    expect(await rerunMigrationLinkFixup(job.id)).toEqual({ touched: 1, failed: 0 });
    expect((await getMigrationJob(job.id)).jobIssues).toEqual([]);

    // 다시 눌러도 안전하다 — 이미 정리된 문서는 손대지 않는다
    expect(await rerunMigrationLinkFixup(job.id)).toEqual({ touched: 0, failed: 0 });
  });

  it("끝나지 않은 잡은 링크 정리를 다시 돌릴 수 없다", async () => {
    const job = await makeJob();
    await discoverMigrationJob(job.id);

    await expect(rerunMigrationLinkFixup(job.id)).rejects.toThrow("끝난 작업에만");

    await startMigrationJob(job.id);
    await expect(rerunMigrationLinkFixup(job.id)).rejects.toThrow("RUNNING");
  });

  it("항목 목록은 상태·단계로 거른다", async () => {
    const job = await makeJob();
    await discoverMigrationJob(job.id);
    await startMigrationJob(job.id);
    for (let tick = 0; tick < 4; tick += 1) await getMigrationJob(job.id);

    expect((await listMigrationItems(job.id)).total).toBe(12);
    expect((await listMigrationItems(job.id, { status: "DEAD_LETTER" })).total).toBe(1);
    expect((await listMigrationItems(job.id, { stage: "DONE" })).total).toBe(11);
  });

  it("잡 목록은 최신순이고 원본 키·발견 수를 함께 준다", async () => {
    const first = await makeJob("DRY_RUN");
    await discoverMigrationJob(first.id);
    await createMigrationJob({
      provider: "CONFLUENCE_DC",
      targetSpaceId: "sp1",
      mode: "IMPORT",
      source: { ...SOURCE, spaceKey: "OPS" },
    });

    const jobs = await listMigrationJobs();
    expect(jobs).not.toBeNull();
    expect(jobs!.map((j) => j.sourceSpaceKey)).toEqual(["OPS", "DOCS"]);
    expect(jobs!.find((j) => j.sourceSpaceKey === "DOCS")?.discoveredCount).toBe(12);
  });
});
