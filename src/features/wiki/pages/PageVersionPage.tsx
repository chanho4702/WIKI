import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { Banner, Button, EmptyState } from "@chanho/react";
import { ArrowLeft } from "lucide-react";
import type { PageVersion } from "../store/types";
import { getVersion } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { MarkdownView } from "../components/MarkdownView";
import { SkeletonLines } from "../components/WikiSkeleton";
import { RestoreVersionDialog } from "../components/RestoreVersionDialog";
import { formatVersionDateTime, usePageHistory, versionAuthorName, versionLabel } from "../lib/pageHistory";

/**
 * 이전 버전 보기 (`/spaces/:spaceId/pages/:pageId/history/:version`).
 *
 * 주소의 `:version`은 버전 번호다(내부 id가 아니다) — 이력 화면의 링크는 공유되고, 공유받은
 * 사람에게 "v. 5"는 말이 되지만 합성 id는 되지 않는다. 본문은 목록이 주지 않으므로(메타만)
 * 이 화면이 그때 단건으로 읽는다.
 */
export function PageVersionPage() {
  const { spaceId, pageId, version } = useParams();
  const navigate = useNavigate();
  const { reloadPages } = useOutletContext<WikiOutletContext>();
  const { page, versions, users, error, reload } = usePageHistory(pageId);
  const versionNumber = Number(version);
  const meta = versions?.find((v) => v.version === versionNumber) ?? null;
  const [full, setFull] = useState<PageVersion | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  useEffect(() => {
    if (!pageId || !meta) return;
    let cancelled = false;
    setFull(null);
    setBodyError(null);
    void getVersion(pageId, meta.id)
      .then((loaded) => {
        if (!cancelled) setFull(loaded);
      })
      .catch((e: unknown) => {
        if (!cancelled) setBodyError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, meta?.id]);

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
  if (meta === null) {
    return (
      <div className="history-page">
        <EmptyState
          title="버전을 찾을 수 없습니다"
          description={`${versionLabel(versionNumber)}은(는) 이 문서의 이력에 없습니다.`}
          primaryAction={{ label: "페이지 히스토리", onClick: () => navigate(historyPath) }}
        />
      </div>
    );
  }

  const currentVersion = versions[0]?.version;
  const isCurrent = meta.version === currentVersion;
  const authorName = versionAuthorName(users, meta);
  const savedAt = formatVersionDateTime(meta.savedAt);

  return (
    <div className="history-page history-version-page">
      {/* 레퍼런스 없음 — 임시: 스펙 §3에는 뒤로 링크가 없지만, 배너 버튼만으로는 이력 표로
        * 돌아갈 길이 브라우저 뒤로가기뿐이다(비교 화면 §4에는 같은 링크가 있다). */}
      <Link className="history-back" to={historyPath}>
        <ArrowLeft size={16} aria-hidden="true" />
        페이지 히스토리
      </Link>
      {isCurrent ? (
        <p className="history-current-note">
          현재 버전입니다. <Link to={historyPath}>히스토리로 돌아가기</Link>
        </p>
      ) : (
        <Banner variant="info" className="history-banner">
          {/* DS Banner는 children을 자기 콘텐츠 칸에 넣는다 — 문구와 액션의 좌우 배치는
            * 그 안에서 우리가 잡는다(배너 루트에 flex를 걸면 아이콘 칸까지 흔든다). */}
          <span className="history-banner-inner">
            <span className="history-banner-text">
              이전 버전({versionLabel(meta.version)})을 보고 있습니다. {authorName}
              {savedAt ? ` · ${savedAt}` : ""}
              {meta.changeNote ? ` · "${meta.changeNote}"` : ""}
            </span>
            <span className="history-banner-actions">
              <Button
                size="small"
                variant="subtle"
                onClick={() => navigate(`/spaces/${spaceId}/pages/${pageId}`)}
              >
                현재 버전 보기
              </Button>
              <Button
                size="small"
                variant="subtle"
                onClick={() => navigate(`${historyPath}/compare?from=${meta.version}&to=${currentVersion}`)}
              >
                현재 버전과 비교
              </Button>
              <Button size="small" onClick={() => setRestoreOpen(true)}>
                이 버전으로 복원
              </Button>
            </span>
          </span>
        </Banner>
      )}
      {bodyError !== null ? (
        <EmptyState
          title="이 버전을 불러올 수 없습니다"
          description={bodyError}
          primaryAction={{ label: "다시 시도", onClick: reload }}
        />
      ) : full === null ? (
        <SkeletonLines label="버전 본문 로딩 중" widths={["92%", "100%", "86%", "54%"]} />
      ) : (
        <>
          <h1 className="history-version-title">{full.title}</h1>
          <MarkdownView markdown={full.body} spaceId={spaceId} />
        </>
      )}
      <RestoreVersionDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        page={page}
        version={meta}
        onRestored={async () => {
          await reloadPages();
          navigate(`/spaces/${spaceId}/pages/${pageId}`);
        }}
      />
    </div>
  );
}
