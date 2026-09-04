import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Banner,
  Button,
  EmptyState,
  Lozenge,
  Radio,
  RadioGroup,
  Select,
  Spinner,
  Table,
  TextField,
  useToast,
} from "@chanho/react";
import { DatabaseBackup, PlugZap, Plus } from "lucide-react";
import { SettingsHeader } from "../components/SettingsItem";
import type {
  MigrationJobSummary,
  MigrationMode,
  MigrationSourceProbe,
  Space,
} from "../store/types";
import {
  createMigrationJob,
  listMigrationJobs,
  listSpaces,
  probeConfluenceDc,
} from "../store/wikiStore";
import { jobStatusAppearance, jobStatusLabel, modeLabel } from "../lib/migrationLabels";

/**
 * 컨플루언스 DC 마이그레이션(`/admin/migrations`, M1) — 전역 관리자 전용.
 *
 * 권한 판정은 서버가 한다: 잡 목록이 403이면 스토어가 null을 준다. 검색 색인 관리와 같은 방식으로
 * 화면이 스스로 "관리할 수 없습니다"를 보여준다 — 메뉴에서 감춰도 주소를 직접 치는 사람이 있다.
 *
 * 원본 토큰(PAT)은 **이 화면 안에서만 살아 있다.** 연결 확인과 잡 생성 요청 본문으로만 나가고,
 * 응답·저장·URL 어디에도 남지 않으며, 잡을 만든 뒤에는 입력칸을 비운다(설계 §1.1 P8).
 */

/** 빈 문자열은 Select의 "미선택"과 구분되지 않는다 — 센티널을 쓴다. */
const NO_SPACE = "__none";

export function MigrationsAdminPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<MigrationJobSummary[] | null | "denied">(null);
  const [spaces, setSpaces] = useState<Space[]>([]);

  const [baseUrl, setBaseUrl] = useState("");
  const [spaceKey, setSpaceKey] = useState("");
  const [token, setToken] = useState("");
  const [targetSpaceId, setTargetSpaceId] = useState(NO_SPACE);
  const [mode, setMode] = useState<MigrationMode>("DRY_RUN");

  const [probe, setProbe] = useState<MigrationSourceProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    try {
      const found = await listMigrationJobs();
      setJobs(found ?? "denied");
    } catch {
      setJobs("denied");
    }
  }, []);

  useEffect(() => {
    void reload();
    void listSpaces()
      .then(setSpaces)
      .catch(() => setSpaces([]));
  }, [reload]);

  const fail = (title: string, e: unknown) =>
    toast({ title, description: e instanceof Error ? e.message : String(e), appearance: "danger" });

  const sourceFilled = baseUrl.trim() !== "" && spaceKey.trim() !== "" && token.trim() !== "";

  const handleProbe = async () => {
    setProbing(true);
    setProbe(null);
    try {
      setProbe(await probeConfluenceDc({ baseUrl, spaceKey, token }));
    } catch (e) {
      fail("연결하지 못했습니다", e);
    } finally {
      setProbing(false);
    }
  };

  const handleCreate = async () => {
    if (!sourceFilled || targetSpaceId === NO_SPACE) return;
    setCreating(true);
    try {
      const job = await createMigrationJob({
        provider: "CONFLUENCE_DC",
        targetSpaceId,
        mode,
        source: { baseUrl, spaceKey, token },
      });
      // 토큰은 잡을 만든 순간 화면에서도 지운다 — 다시 보여줄 일이 없다.
      setToken("");
      setProbe(null);
      navigate(`/admin/migrations/${job.id}`);
    } catch (e) {
      fail("마이그레이션을 만들지 못했습니다", e);
    } finally {
      setCreating(false);
    }
  };

  if (jobs === null) {
    return (
      <div className="space-settings" role="status">
        <Spinner size="large" label="마이그레이션 목록 불러오는 중" />
      </div>
    );
  }

  if (jobs === "denied") {
    return (
      <div className="space-settings">
        <EmptyState
          title="마이그레이션을 관리할 수 없습니다"
          description="전역 관리자만 볼 수 있는 화면입니다."
        />
      </div>
    );
  }

  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? `스페이스 #${id}`;

  return (
    <div className="space-settings">
      <SettingsHeader
        icon={<DatabaseBackup size={20} aria-hidden="true" />}
        title="마이그레이션"
        description="컨플루언스 Data Center 스페이스의 문서를 이 위키로 옮깁니다."
      />

      <div className="space-settings-form">
        <form
          className="migration-new"
          aria-label="새 마이그레이션"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <h2 className="migration-section-title">새 마이그레이션</h2>

          <TextField
            label="원본 컨플루언스 주소"
            description="예: https://confluence.example.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <TextField
            label="원본 스페이스 키"
            description="컨플루언스 스페이스 URL의 키입니다. 예: DOCS"
            value={spaceKey}
            onChange={(e) => setSpaceKey(e.target.value)}
          />
          {/*
            토큰은 화면에도 남기지 않는다 — 입력 중에도 가리고, 잡을 만든 뒤에는 지운다.
            서버는 이 값을 응답으로 절대 돌려주지 않으므로 다시 채워 넣을 방법도 없다(그게 맞다).
          */}
          <TextField
            label="접근 토큰(PAT)"
            type="password"
            autoComplete="off"
            description="요청에만 쓰이고 화면에는 다시 표시되지 않습니다."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />

          <Button
            type="button"
            variant="subtle"
            disabled={!sourceFilled || probing}
            loading={probing}
            iconBefore={<PlugZap size={16} aria-hidden="true" />}
            onClick={() => void handleProbe()}
          >
            연결 확인
          </Button>

          {probe ? (
            <Banner variant="info">
              연결됨 — 스페이스 &quot;{probe.spaceName}&quot;
              {probe.pageCount === null
                ? " · 페이지 수를 세지 못했습니다"
                : ` · 페이지 ${probe.pageCount.toLocaleString("ko-KR")}건`}
            </Banner>
          ) : null}

          <Select
            label="대상 스페이스"
            value={targetSpaceId}
            options={[
              { value: NO_SPACE, label: "스페이스를 고르세요" },
              ...spaces.map((s) => ({ value: s.id, label: `${s.name} (${s.key})` })),
            ]}
            onValueChange={setTargetSpaceId}
          />
          <p className="migration-hint">
            문서가 이 스페이스 아래에 새로 만들어집니다. 기존 문서와 섞이지 않도록 빈 스페이스를
            권장합니다.
          </p>

          <RadioGroup
            className="migration-mode"
            aria-label="실행 모드"
            value={mode}
            onValueChange={(next: string) => setMode(next as MigrationMode)}
          >
            <Radio value="DRY_RUN" label="시험 실행 — 문서를 만들지 않고 보고서만 냅니다" />
            <Radio value="IMPORT" label="실제 이관 — 대상 스페이스에 문서를 만듭니다" />
          </RadioGroup>

          <Button
            type="submit"
            disabled={creating || !sourceFilled || targetSpaceId === NO_SPACE}
            loading={creating}
            iconBefore={<Plus size={16} aria-hidden="true" />}
          >
            마이그레이션 만들기
          </Button>
        </form>

        <h2 className="migration-section-title">잡 목록</h2>
        {jobs.length === 0 ? (
          <EmptyState
            title="아직 마이그레이션이 없습니다"
            description="위에서 원본과 대상을 정해 시험 실행부터 해 보세요."
          />
        ) : (
          <Table
            aria-label="마이그레이션 잡"
            onRowClick={(row) => navigate(`/admin/migrations/${row.id}`)}
            columns={[
              { key: "sourceSpaceKey", header: "원본 스페이스" },
              { key: "target", header: "대상 스페이스", render: (row) => spaceName(row.targetSpaceId) },
              { key: "mode", header: "모드", render: (row) => modeLabel(row.mode) },
              {
                key: "status",
                header: "상태",
                render: (row) => (
                  <Lozenge appearance={jobStatusAppearance(row.status)}>{jobStatusLabel(row.status)}</Lozenge>
                ),
              },
              {
                key: "discoveredCount",
                header: "발견",
                align: "right",
                render: (row) => `${row.discoveredCount.toLocaleString("ko-KR")}건`,
              },
              {
                key: "createdAt",
                header: "만든 시각",
                render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString("ko-KR") : "-"),
              },
            ]}
            rows={jobs.map((job) => ({ ...job, sourceSpaceKey: job.sourceSpaceKey ?? "-" }))}
          />
        )}
      </div>
    </div>
  );
}
