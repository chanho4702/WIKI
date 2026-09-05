import { useState } from "react";
import { Link, Navigate, useNavigate, useOutletContext, useParams } from "react-router";
import { Avatar, Button, Checkbox, EmptyState, Lozenge, Table } from "@chanho/react";
import type { TableColumn } from "@chanho/react";
import { ArrowLeft } from "lucide-react";
import type { PageVersion } from "../store/types";
import type { WikiOutletContext } from "../components/wikiContext";
import { SkeletonLines } from "../components/WikiSkeleton";
import { RestoreVersionDialog } from "../components/RestoreVersionDialog";
import { formatVersionDateTime, usePageHistory, versionAuthorName, versionLabel } from "../lib/pageHistory";

/**
 * 페이지 히스토리 표 (`/spaces/:spaceId/pages/:pageId/history`) — 컨플루언스 페이지 히스토리.
 *
 * 예전에는 모달 안 좁은 목록이었다. 버전이 수십 개가 되면 "누가·언제·왜"가 한 줄에 눌려
 * 읽히지 않고, 두 버전 비교는 select 조합이라 발견되지 않았다 — 전용 화면의 표로 편다.
 */
export function PageHistoryPage() {
  const { spaceId, pageId } = useParams();
  const navigate = useNavigate();
  const { reloadPages } = useOutletContext<WikiOutletContext>();
  const { page, versions, users, error, reload } = usePageHistory(pageId);
  /**
   * 비교 대상 — 버전 **번호**로 들고 있다(비교 URL이 번호를 쓴다).
   * 컨플루언스처럼 두 개까지만 고를 수 있고, 세 번째를 고르면 가장 먼저 고른 것이 풀린다.
   * 체크박스를 비활성으로 막으면 "왜 안 눌리지"가 되고, 먼저 해제하는 절차를 강요한다.
   */
  const [selected, setSelected] = useState<number[]>([]);
  const [restoreTarget, setRestoreTarget] = useState<PageVersion | null>(null);

  const toggleSelect = (version: number, checked: boolean) => {
    setSelected((prev) => {
      if (!checked) return prev.filter((v) => v !== version);
      if (prev.includes(version)) return prev;
      const next = [...prev, version];
      return next.length > 2 ? next.slice(next.length - 2) : next;
    });
  };

  const historyPath = `/spaces/${spaceId}/pages/${pageId}/history`;

  if (error !== null) {
    return (
      <div className="history-page">
        <EmptyState
          title="히스토리를 불러올 수 없습니다"
          description={error}
          primaryAction={{ label: "다시 시도", onClick: reload }}
        />
      </div>
    );
  }
  if (page === undefined || versions === null) {
    return (
      <div className="history-page">
        <SkeletonLines label="버전 로딩 중" widths={["70%", "65%", "72%", "60%"]} />
      </div>
    );
  }
  if (page === null) {
    return <p>페이지를 찾을 수 없습니다</p>;
  }
  if (page.spaceId !== spaceId) {
    // 잘못된 스페이스 URL — 페이지가 속한 스페이스로 redirect(보기 화면과 같은 규칙)
    return <Navigate to={`/spaces/${page.spaceId}/pages/${page.id}/history`} replace />;
  }

  // 현재 버전 = 목록의 첫 항목(스토어가 version 내림차순을 보장한다)
  const currentVersion = versions[0]?.version;

  const columns: TableColumn<PageVersion>[] = [
    {
      // 레퍼런스 없음 — 임시 "선택": 컨플루언스 헤더는 아이콘이지만 전체 선택 기능이 없어
      // 글자 머리말을 쓴다(스크린리더가 읽을 열 이름이 필요하다).
      key: "select",
      header: "선택",
      width: "56px",
      adjustable: false,
      render: (version) => (
        <Checkbox
          className="history-select"
          label={`${versionLabel(version.version)} 선택`}
          checked={selected.includes(version.version)}
          onCheckedChange={(checked) => toggleSelect(version.version, checked === true)}
        />
      ),
    },
    {
      key: "version",
      header: "버전",
      width: "120px",
      render: (version) => (
        <span className="history-version-cell">
          <Link to={`${historyPath}/${version.version}`}>{versionLabel(version.version)}</Link>
          {version.version === currentVersion ? (
            // 상태를 색으로만 구분하지 않는다(WCAG 1.4.1) — 글자 배지
            <Lozenge appearance="info">현재</Lozenge>
          ) : null}
        </span>
      ),
    },
    {
      key: "author",
      header: "변경한 사람",
      width: "200px",
      render: (version) => {
        const name = versionAuthorName(users, version);
        return (
          <span className="history-author-cell">
            <Avatar name={name} color="auto" size="small" />
            {name}
          </span>
        );
      },
    },
    {
      key: "savedAt",
      header: "날짜",
      width: "220px",
      // 원문(ISO)은 title로 남긴다 — 표기는 브라우저 로캘이라 정확한 시각이 필요한 사람이 있다
      render: (version) => (
        <span title={version.savedAt || undefined}>{formatVersionDateTime(version.savedAt)}</span>
      ),
    },
    {
      key: "changeNote",
      header: "변경 요약",
      render: (version) => version.changeNote ?? "—",
    },
    {
      key: "actions",
      header: "작업",
      width: "160px",
      adjustable: false,
      render: (version) =>
        version.version === currentVersion ? null : (
          <Button variant="subtle" size="small" onClick={() => setRestoreTarget(version)}>
            이 버전으로 복원
          </Button>
        ),
    },
  ];

  return (
    <div className="history-page">
      <Link className="history-back" to={`/spaces/${spaceId}/pages/${pageId}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        {page.title}
      </Link>
      <h1 className="history-page-title">페이지 히스토리</h1>
      <div className="history-page-toolbar">
        <p className="history-page-hint">비교할 버전 2개를 선택하세요.</p>
        <Button
          disabled={selected.length !== 2}
          onClick={() => {
            const [from, to] = [...selected].sort((a, b) => a - b);
            navigate(`${historyPath}/compare?from=${from}&to=${to}`);
          }}
        >
          선택한 버전 비교
        </Button>
      </div>
      {versions.length === 0 ? (
        <EmptyState
          title="아직 저장된 버전이 없습니다"
          description="문서를 저장할 때마다 그 시점의 내용이 여기에 쌓입니다."
        />
      ) : (
        <Table
          aria-label="페이지 히스토리"
          className="history-table"
          columns={columns}
          rows={versions}
          resizable
        />
      )}
      {restoreTarget ? (
        <RestoreVersionDialog
          open={restoreTarget !== null}
          onOpenChange={(open) => {
            if (!open) setRestoreTarget(null);
          }}
          page={page}
          version={restoreTarget}
          onRestored={async () => {
            await reloadPages(); // 제목이 복원된 경우 사이드바 트리 반영
            navigate(`/spaces/${spaceId}/pages/${pageId}`);
          }}
        />
      ) : null}
    </div>
  );
}
