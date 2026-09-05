import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import { Avatar, Button, EmptyState } from "@chanho/react";
import { ArrowLeft } from "lucide-react";
import type { PageVersion } from "../store/types";
import { getVersion } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { DiffView } from "../components/DiffView";
import { SkeletonLines } from "../components/WikiSkeleton";
import { RestoreVersionDialog } from "../components/RestoreVersionDialog";
import { formatVersionDateTime, usePageHistory, versionAuthorName, versionLabel } from "../lib/pageHistory";

/** 비교 대상 한 쪽의 메타 카드 — 누가·언제·무엇을 고쳤다고 적었는지. */
function CompareMetaCard({ version, authorName }: { version: PageVersion; authorName: string }) {
  const savedAt = formatVersionDateTime(version.savedAt);
  return (
    <section className="history-compare-card">
      <h2 className="history-compare-card-title">{versionLabel(version.version)}</h2>
      <span className="history-compare-card-meta">
        <Avatar name={authorName} color="auto" size="small" />
        {authorName}
        {savedAt ? ` · ${savedAt}` : ""}
        {version.changeNote ? ` · ${version.changeNote}` : ""}
      </span>
    </section>
  );
}

/**
 * 두 버전 비교 (`/spaces/:spaceId/pages/:pageId/history/compare?from=3&to=5`).
 *
 * 비교 대상이 주소에 있어야 공유·북마크·뒤로가기가 성립한다 — 예전 모달의 select 조합은
 * 화면을 닫으면 사라졌다. `from`이 `to`보다 크면 바꿔서 보여준다(표에서 고른 순서와 무관하게
 * 옛것 → 새것 방향의 diff가 읽기 쉬운 방향이다).
 */
export function PageCompareVersionsPage() {
  const { spaceId, pageId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { reloadPages } = useOutletContext<WikiOutletContext>();
  const { page, versions, users, error, reload } = usePageHistory(pageId);
  const [bodies, setBodies] = useState<Record<string, PageVersion>>({});
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const rawFrom = Number(searchParams.get("from"));
  const rawTo = Number(searchParams.get("to"));
  const valid = Number.isInteger(rawFrom) && Number.isInteger(rawTo) && rawFrom > 0 && rawTo > 0;
  const fromVersion = valid ? Math.min(rawFrom, rawTo) : null;
  const toVersion = valid ? Math.max(rawFrom, rawTo) : null;

  const fromMeta = versions?.find((v) => v.version === fromVersion) ?? null;
  const toMeta = versions?.find((v) => v.version === toVersion) ?? null;

  // 화면에 필요한 두 버전의 본문만 읽는다(목록은 메타만 준다).
  useEffect(() => {
    if (!pageId || !fromMeta || !toMeta) return;
    let cancelled = false;
    setBodyError(null);
    void Promise.all([getVersion(pageId, fromMeta.id), getVersion(pageId, toMeta.id)])
      .then(([older, newer]) => {
        if (!cancelled) setBodies({ [older.id]: older, [newer.id]: newer });
      })
      .catch((e: unknown) => {
        if (!cancelled) setBodyError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, fromMeta?.id, toMeta?.id]);

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
  // 주소에 비교 대상이 없거나 이력에 없는 버전 — 빈 diff로 삼키지 않고 에러 상태로 알린다
  if (!valid || fromMeta === null || toMeta === null) {
    return (
      <div className="history-page">
        <EmptyState
          title="비교할 두 버전을 찾을 수 없습니다"
          description="히스토리 표에서 버전 2개를 선택해 다시 시도하세요."
          primaryAction={{ label: "페이지 히스토리", onClick: () => navigate(historyPath) }}
        />
      </div>
    );
  }

  const currentVersion = versions[0]?.version;
  const olderBody = bodies[fromMeta.id];
  const newerBody = bodies[toMeta.id];

  return (
    <div className="history-page">
      <Link className="history-back" to={historyPath}>
        <ArrowLeft size={16} aria-hidden="true" />
        페이지 히스토리
      </Link>
      <h1 className="history-page-title">
        {versionLabel(fromMeta.version)} ↔ {versionLabel(toMeta.version)} 비교
      </h1>
      <div className="history-compare-meta">
        <CompareMetaCard version={fromMeta} authorName={versionAuthorName(users, fromMeta)} />
        <CompareMetaCard version={toMeta} authorName={versionAuthorName(users, toMeta)} />
        {toMeta.version === currentVersion ? null : (
          <Button onClick={() => setRestoreOpen(true)}>
            {versionLabel(toMeta.version)}로 복원
          </Button>
        )}
      </div>
      {bodyError !== null ? (
        <EmptyState
          title="버전 본문을 불러올 수 없습니다"
          description={bodyError}
          primaryAction={{ label: "다시 시도", onClick: reload }}
        />
      ) : !olderBody || !newerBody ? (
        <SkeletonLines label="버전 본문 로딩 중" widths={["92%", "100%", "86%", "54%"]} />
      ) : (
        <>
          {/* 제목은 diff 대상(본문)이 아니라 별도로 바뀐다 — 바뀐 경우에만 한 줄로 알린다 */}
          {olderBody.title !== newerBody.title ? (
            <p className="diff-title-change">
              제목: {olderBody.title} → {newerBody.title}
            </p>
          ) : null}
          <DiffView oldText={olderBody.body} newText={newerBody.body} />
        </>
      )}
      <RestoreVersionDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        page={page}
        version={toMeta}
        onRestored={async () => {
          await reloadPages();
          navigate(`/spaces/${spaceId}/pages/${pageId}`);
        }}
      />
    </div>
  );
}
