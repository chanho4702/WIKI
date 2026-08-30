import { useCallback, useEffect, useRef, useState } from "react";
import { Banner, Button, EmptyState, Spinner, useToast } from "@chanho/react";
import { RefreshCw, Database } from "lucide-react";
import { SettingsHeader } from "../components/SettingsItem";
import type { ReindexJob, SearchIndexStatus } from "../store/types";
import { getReindexJob, getSearchIndexStatus, startReindex } from "../store/wikiStore";

/**
 * 검색 색인 관리(W23) — 전역 관리자 전용.
 *
 * 색인 매핑이 `dynamic: strict`라 새 필드를 더한 배포 뒤에는 **재색인해야 그 필드가 채워진다.**
 * 그전까지 새 필터는 오류 없이 0건만 낸다 — 실제로 라벨 필터가 그렇게 조용히 죽어 있었다.
 *
 * 그동안 재색인은 브라우저 개발자도구에서 토큰을 복사해 손으로 호출하는 수밖에 없었다. 색인
 * 필드는 앞으로도 늘어나므로 그 수작업을 화면으로 옮긴다.
 */

/** 진행 중일 때만 짧게 다시 묻는다 — 끝난 뒤에도 계속 물으면 서버만 두드린다. */
const POLL_MS = 2000;

function formatCount(value: number): string {
  return value < 0 ? "알 수 없음" : `${value.toLocaleString("ko-KR")}건`;
}

export function SearchAdminPage() {
  const toast = useToast();
  const [status, setStatus] = useState<SearchIndexStatus | null | "denied">(null);
  const [job, setJob] = useState<ReindexJob | null>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      const found = await getSearchIndexStatus();
      // null = 403(전역 관리자가 아님) 또는 색인이 없는 모드. 화면은 둘을 같게 다룬다.
      setStatus(found ?? "denied");
      setJob(found?.runningJob ?? null);
    } catch {
      setStatus("denied");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 진행 중인 잡만 따라간다. 끝나면 현황을 한 번 다시 읽어 새 세대·문서 수를 반영한다.
  useEffect(() => {
    if (!job || job.state !== "RUNNING") return;
    timer.current = setTimeout(() => {
      void getReindexJob(job.jobId)
        .then((next) => {
          setJob(next);
          if (next.state !== "RUNNING") void reload();
        })
        .catch(() => setJob(null));
    }, POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [job, reload]);

  const start = async () => {
    setStarting(true);
    try {
      setJob(await startReindex());
      toast({ title: "재색인을 시작했습니다", appearance: "success" });
    } catch (e) {
      toast({
        title: "재색인을 시작하지 못했습니다",
        description: e instanceof Error ? e.message : String(e),
        appearance: "danger",
      });
    } finally {
      setStarting(false);
    }
  };

  if (status === null) {
    return (
      <div className="space-settings" role="status">
        <Spinner size="large" label="색인 현황 불러오는 중" />
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="space-settings">
        <EmptyState
          title="검색 색인을 관리할 수 없습니다"
          description="전역 관리자만 볼 수 있는 화면입니다."
        />
      </div>
    );
  }

  const running = job?.state === "RUNNING";

  return (
    <div className="space-settings">
      <SettingsHeader
        icon={<Database size={20} aria-hidden="true" />}
        title="검색 색인"
        description="지금 서비스 중인 색인 세대와 문서 수입니다."
      />

      <div className="space-settings-form">
        <dl className="search-admin-facts">
          <div>
            <dt>페이지 색인</dt>
            <dd>
              <code>{status.pageIndex}</code> · {formatCount(status.pageDocs)}
            </dd>
          </div>
          <div>
            <dt>첨부 색인</dt>
            <dd>
              <code>{status.attachmentIndex}</code> · {formatCount(status.attachmentDocs)}
            </dd>
          </div>
        </dl>

        {/*
          왜 눌러야 하는지를 화면에 적어 둔다 — 이 버튼은 자주 쓰지 않아서, 필요한 순간에
          "이게 뭐였더라"가 되면 또 개발자도구를 열게 된다.
        */}
        <p>
          색인에 필드를 더한 배포 뒤에는 재색인해야 그 필드가 채워집니다. 그전까지 새 검색 필터는
          오류 없이 0건만 냅니다. 재색인은 새 세대를 만든 뒤 별칭을 옮기므로 도는 동안에도 검색은
          끊기지 않습니다.
        </p>

        <Button
          disabled={starting || running}
          loading={starting}
          iconBefore={<RefreshCw size={16} aria-hidden="true" />}
          onClick={() => void start()}
        >
          {running ? "재색인 진행 중" : "재색인 시작"}
        </Button>

        {/* Banner에는 success 변형이 없다 — 성공도 info로 알리고 문구가 결과를 말한다 */}
        {job ? (
          <Banner variant={job.state === "FAILED" ? "danger" : "info"}>
            {job.state === "FAILED"
              ? `재색인 실패: ${job.failure ?? "원인 불명"}`
              : job.state === "SUCCEEDED"
                ? `완료 — 페이지 ${job.pagesIndexed.toLocaleString("ko-KR")}건, 첨부 ${job.attachmentsIndexed.toLocaleString("ko-KR")}건${job.aliasSwitched ? " (별칭 전환됨)" : ""}`
                : `진행 중 — 페이지 ${job.pagesIndexed.toLocaleString("ko-KR")}건, 첨부 ${job.attachmentsIndexed.toLocaleString("ko-KR")}건`}
          </Banner>
        ) : null}
      </div>
    </div>
  );
}
