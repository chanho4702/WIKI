import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Banner, Button, EmptyState, Lozenge, Spinner, Table, useToast } from "@chanho/react";
import { Ban, ArrowLeft, DatabaseBackup, Link2, Play, Search } from "lucide-react";
import { SettingsHeader } from "../components/SettingsItem";
import type { MigrationJob, MigrationReport, Space } from "../store/types";
import {
  cancelMigrationJob,
  discoverMigrationJob,
  getMigrationJob,
  getMigrationReport,
  listSpaces,
  rerunMigrationLinkFixup,
  startMigrationJob,
} from "../store/wikiStore";
import {
  issueCodeLabel,
  itemStatusLabel,
  jobStatusAppearance,
  jobStatusLabel,
  modeLabel,
  severityLabel,
  severityRank,
  stageLabel,
} from "../lib/migrationLabels";

/**
 * 마이그레이션 상세(`/admin/migrations/:jobId`, M1).
 *
 * 원본 요약 → 발견 → 시작 → 진행률 → 보고서 → 데드레터가 한 화면에서 이어진다. 잡이 도는 동안만
 * 5초마다 다시 묻고(끝난 뒤에도 계속 물으면 서버만 두드린다) 화면을 떠나면 멈춘다.
 *
 * 잡과 보고서는 **같은 틱에서 함께** 읽는다 — 따로 폴링하면 진행률과 손실 집계가 서로 다른
 * 시점을 가리켜 "완료 12건인데 보고서는 9건"처럼 보인다.
 */

/** 진행 중일 때만 짧게 다시 묻는다. */
const POLL_MS = 5000;

/**
 * 집계는 group-by 결과라 **0인 키가 아예 없다** — 아직 그 상태·단계에 닿은 항목이 없으면 키 자체가
 * 오지 않는다. 그래서 진행률은 반드시 `?? 0`으로 읽는다(없는 키를 그대로 나누면 NaN%가 뜬다).
 */
function countOf(counts: Record<string, number>, key: string): number {
  return counts[key] ?? 0;
}

/** 값이 있는 칸만 보여 준다 — 0건인 단계까지 늘어놓으면 어디가 막혔는지가 묻힌다. */
function countEntries(counts: Record<string, number>, label: (key: string) => string) {
  return Object.entries(counts)
    .filter(([, total]) => total > 0)
    .map(([key, total]) => ({ key, label: label(key), total }));
}

export function MigrationJobPage() {
  const { jobId = "" } = useParams();
  const toast = useToast();
  const [job, setJob] = useState<MigrationJob | null>(null);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    // 잡을 먼저 읽어 진행을 한 칸 당기고, 그 상태로 보고서를 읽는다.
    const next = await getMigrationJob(jobId);
    setJob(next);
    setReport(await getMigrationReport(jobId));
    setError(null);
  }, [jobId]);

  useEffect(() => {
    void reload().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    void listSpaces()
      .then(setSpaces)
      .catch(() => setSpaces([]));
  }, [reload]);

  // 도는 동안만 따라간다. job이 바뀔 때마다 타이머를 다시 걸고, 상태가 RUNNING을 벗어나면 멈춘다.
  useEffect(() => {
    if (job?.status !== "RUNNING") return;
    timer.current = setTimeout(() => {
      void reload().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }, POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [job, reload]);

  const run = async (title: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (e) {
      toast({ title, description: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  if (error !== null && job === null) {
    return (
      <div className="space-settings">
        <EmptyState title="마이그레이션을 불러올 수 없습니다" description={error} />
      </div>
    );
  }

  if (job === null) {
    return (
      <div className="space-settings" role="status">
        <Spinner size="large" label="마이그레이션 불러오는 중" />
      </div>
    );
  }

  const source = job.source;
  const done = countOf(job.counts.byStatus, "COMPLETED");
  const dead = countOf(job.counts.byStatus, "DEAD_LETTER");
  const total = job.itemCount;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const targetSpace = spaces.find((s) => s.id === job.targetSpaceId);

  const jobIssues = job.jobIssues ?? [];
  const finished = job.status === "COMPLETED" || job.status === "FAILED";
  const issues = [...(report?.issues ?? [])].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || a.code.localeCompare(b.code),
  );
  const deadLetters = report?.deadLetters ?? [];

  return (
    <div className="space-settings">
      <Link className="migration-back" to="/admin/migrations">
        <ArrowLeft size={14} aria-hidden="true" /> 마이그레이션 목록
      </Link>

      <SettingsHeader
        icon={<DatabaseBackup size={20} aria-hidden="true" />}
        title={source ? `${source.spaceKey} 이관` : "마이그레이션"}
        description={`${modeLabel(job.mode)} · 대상 ${targetSpace ? targetSpace.name : `스페이스 #${job.targetSpaceId}`}`}
        action={<Lozenge appearance={jobStatusAppearance(job.status)}>{jobStatusLabel(job.status)}</Lozenge>}
      />

      <div className="space-settings-form">
        {error !== null ? <Banner variant="danger">{error}</Banner> : null}

        <section aria-labelledby="migration-source-title">
          <h2 className="migration-section-title" id="migration-source-title">
            원본
          </h2>
          {source ? (
            <dl className="migration-facts">
              <div>
                <dt>주소</dt>
                <dd>{source.baseUrl}</dd>
              </div>
              <div>
                <dt>스페이스 키</dt>
                <dd>{source.spaceKey}</dd>
              </div>
              <div>
                <dt>스페이스 이름</dt>
                <dd>{source.spaceName ?? "아직 확인하지 않음"}</dd>
              </div>
              <div>
                <dt>발견</dt>
                <dd>{source.discoveredCount.toLocaleString("ko-KR")}건</dd>
              </div>
            </dl>
          ) : (
            <p className="migration-hint">이 잡에는 원본 정보가 없습니다.</p>
          )}
        </section>

        <div className="migration-actions">
          <Button
            variant="subtle"
            disabled={busy || job.status !== "PENDING"}
            iconBefore={<Search size={16} aria-hidden="true" />}
            onClick={() =>
              void run("발견하지 못했습니다", async () => {
                const found = await discoverMigrationJob(job.id);
                toast({
                  title: `원본 ${found.discovered.toLocaleString("ko-KR")}건을 확인했습니다`,
                  description: `새로 담은 항목 ${found.enqueued}건, 이미 있던 항목 ${found.skipped}건`,
                  appearance: "success",
                });
              })
            }
          >
            원본 발견
          </Button>
          <Button
            disabled={busy || job.status !== "PENDING" || total === 0}
            iconBefore={<Play size={16} aria-hidden="true" />}
            onClick={() => void run("시작하지 못했습니다", () => startMigrationJob(job.id))}
          >
            시작
          </Button>
          <Button
            variant="danger"
            disabled={busy || (job.status !== "PENDING" && job.status !== "RUNNING")}
            iconBefore={<Ban size={16} aria-hidden="true" />}
            onClick={() => void run("취소하지 못했습니다", () => cancelMigrationJob(job.id))}
          >
            취소
          </Button>
          {/*
            끝난 잡에만 낸다. 도는 중에는 서버가 409를 주므로 비활성 버튼으로 두면 "왜 안 눌리지"가
            되고, 끝나기 전에는 정리할 결과 자체가 없다. 다시 눌러도 안전한 작업이라 확인 대화상자는
            두지 않는다 — 이미 정리된 문서는 손대지 않고 touched 0으로 돌아온다.
          */}
          {finished ? (
            <Button
              variant="subtle"
              disabled={busy}
              iconBefore={<Link2 size={16} aria-hidden="true" />}
              onClick={() =>
                void run("링크 정리를 다시 돌리지 못했습니다", async () => {
                  const result = await rerunMigrationLinkFixup(job.id);
                  toast({
                    title: `링크 정리: ${result.touched.toLocaleString("ko-KR")}건 갱신, ${result.failed.toLocaleString("ko-KR")}건 실패`,
                    appearance: result.failed > 0 ? "danger" : "success",
                  });
                })
              }
            >
              링크 정리 다시 실행
            </Button>
          ) : null}
        </div>

        {/* 진행률은 폴링마다 바뀐다 — 보조기술이 갱신을 읽도록 status 영역에 둔다 */}
        <section className="migration-progress" role="status" aria-labelledby="migration-progress-title">
          <h2 className="migration-section-title" id="migration-progress-title">
            진행률
          </h2>
          <p className="migration-progress-text">
            완료 {done.toLocaleString("ko-KR")} / 전체 {total.toLocaleString("ko-KR")}건 ({percent}%)
            {dead > 0 ? ` · 데드레터 ${dead.toLocaleString("ko-KR")}건` : ""}
          </p>
          <progress className="migration-progress-bar" value={done} max={Math.max(total, 1)} aria-hidden="true" />

          <div className="migration-count-groups">
            <div>
              <h3 className="migration-count-title">상태별</h3>
              <dl className="migration-facts">
                {countEntries(job.counts.byStatus, itemStatusLabel).map((row) => (
                  <div key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>{row.total.toLocaleString("ko-KR")}건</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h3 className="migration-count-title">단계별</h3>
              <dl className="migration-facts">
                {countEntries(job.counts.byStage, stageLabel).map((row) => (
                  <div key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>{row.total.toLocaleString("ko-KR")}건</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* 시험 실행은 문서를 만들지 않으므로 갈 곳이 없다 — 링크는 실제 이관에서만 뜬다 */}
          {job.status === "COMPLETED" && job.mode === "IMPORT" ? (
            <Banner variant="info">
              이관이 끝났습니다.{" "}
              <Link to={`/spaces/${job.targetSpaceId}`}>
                {targetSpace ? targetSpace.name : "대상 스페이스"} 열기
              </Link>
            </Banner>
          ) : null}
        </section>

        {/*
          잡 단위 손실 — 항목 표에도 손실 보고서에도 나오지 않는다(어느 항목에도 매달려 있지 않다).
          여기서 보여주지 않으면 링크 정리 실패가 화면 어디에도 남지 않는다. 대개 빈 목록이라
          없을 때는 섹션째 그리지 않는다 — "없음" 줄이 늘 떠 있으면 있을 때 눈에 띄지 않는다.
        */}
        {jobIssues.length > 0 ? (
          <section aria-labelledby="migration-job-issues-title">
            <h2 className="migration-section-title" id="migration-job-issues-title">
              잡 이슈
            </h2>
            <Table
              aria-label="잡 이슈"
              columns={[
                {
                  key: "severity",
                  header: "심각도",
                  render: (row) => (
                    <Lozenge appearance={row.severity === "ERROR" ? "danger" : row.severity === "WARNING" ? "warning" : "neutral"}>
                      {severityLabel(row.severity)}
                    </Lozenge>
                  ),
                },
                { key: "code", header: "코드" },
                { key: "meaning", header: "설명" },
                { key: "sourcePath", header: "위치" },
                {
                  key: "occurrences",
                  header: "발생",
                  align: "right",
                  render: (row) => `${row.occurrences.toLocaleString("ko-KR")}건`,
                },
              ]}
              rows={jobIssues.map((issue) => ({
                ...issue,
                // 같은 code가 여러 문서에서 날 수 있어 위치까지 합쳐야 행이 갈린다
                id: `${issue.code}:${issue.sourcePath}`,
                meaning: issueCodeLabel(issue.code) || "-",
              }))}
            />
          </section>
        ) : null}

        <section aria-labelledby="migration-issues-title">
          <h2 className="migration-section-title" id="migration-issues-title">
            손실 보고서
          </h2>
          {issues.length === 0 ? (
            <p className="migration-hint">아직 보고된 손실이 없습니다.</p>
          ) : (
            <Table
              aria-label="손실 보고서"
              columns={[
                {
                  key: "severity",
                  header: "심각도",
                  render: (row) => (
                    <Lozenge appearance={row.severity === "ERROR" ? "danger" : row.severity === "WARNING" ? "warning" : "neutral"}>
                      {severityLabel(row.severity)}
                    </Lozenge>
                  ),
                },
                { key: "code", header: "코드" },
                // 코드는 그대로 두고 설명을 옆에 붙인다 — 백엔드 로그·계약 문서와 같은 말로
                // 검색할 수 있어야 하고, 그 말이 무슨 뜻인지도 화면에서 바로 보여야 한다.
                { key: "meaning", header: "설명" },
                {
                  key: "occurrences",
                  header: "발생",
                  align: "right",
                  render: (row) => `${row.occurrences.toLocaleString("ko-KR")}건`,
                },
                {
                  key: "distinctPaths",
                  header: "위치 수",
                  align: "right",
                  render: (row) => `${row.distinctPaths.toLocaleString("ko-KR")}곳`,
                },
                { key: "sampleSourcePath", header: "대표 위치" },
              ]}
              rows={issues.map((issue) => ({
                ...issue,
                id: issue.code,
                meaning: issueCodeLabel(issue.code) || "-",
                sampleSourcePath: issue.sampleSourcePath ?? "-",
              }))}
            />
          )}
        </section>

        <section aria-labelledby="migration-dead-title">
          <h2 className="migration-section-title" id="migration-dead-title">
            데드레터
          </h2>
          {deadLetters.length === 0 ? (
            <p className="migration-hint">재시도로도 끝내지 못한 항목이 없습니다.</p>
          ) : (
            <Table
              aria-label="데드레터"
              columns={[
                { key: "externalObjectId", header: "원본 항목" },
                { key: "stage", header: "단계", render: (row) => stageLabel(row.stage) },
                { key: "lastErrorCode", header: "오류 코드" },
                { key: "retryCount", header: "재시도", align: "right" },
              ]}
              rows={deadLetters.map((item) => ({
                ...item,
                id: item.itemId,
                lastErrorCode: item.lastErrorCode ?? "-",
              }))}
            />
          )}
        </section>
      </div>
    </div>
  );
}
