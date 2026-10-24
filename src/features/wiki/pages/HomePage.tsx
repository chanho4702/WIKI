import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Avatar, Button, EmptyState } from "@chanho/react";
import { FileText, Folder, History, Star } from "lucide-react";
import type { FeedPageRow, PageNode, Space, User } from "../store/types";
import {
  getPage,
  listFollowingFeed,
  listPopularFeed,
  listRecentPages,
  listRecentlyUpdated,
  listSpaces,
  listUsers,
} from "../store/wikiStore";
import { mapLimit } from "../lib/mapLimit";
import { getRecentVisits } from "../lib/recentVisits";
import { relativeTime } from "../lib/relativeTime";
import { useStarredSpaces } from "../lib/starredSpaces";
import { contentPathIn } from "../lib/contentPath";
import { usePersonName } from "../lib/userName";
import { useReadOnly } from "../lib/readOnly";
import { TruncatedText, overflowTitleProps } from "../components/TruncatedText";

/** 홈 "최근 업데이트" 피드 길이 — 스페이스 개요(8)와 같은 기준, 전체 스페이스를 합친 뒤 자른다. */
const RECENT_LIMIT = 8;
/** 스페이스마다 이만큼만 읽어 합친다 — 상위 RECENT_LIMIT만 남기므로 그 이상은 낭비다. */
const RECENT_PER_SPACE = RECENT_LIMIT;
/**
 * 스페이스별 "최근 업데이트" 요청을 한 번에 띄우는 수(W-13). 스페이스를 가로지르는 최근 목록 API가 없어
 * 스페이스마다 묻는데, 스페이스가 많은 설치에서 홈 진입이 요청 수백 개를 동시에 띄워 rate-limit에 걸렸다.
 */
const RECENT_CONCURRENCY = 4;
/** "이어서 작업" 카드 수 */
const RESUME_LIMIT = 6;
/** 팔로잉·인기 피드 길이 — 최근 업데이트와 같은 길이로 맞춰 탭을 바꿔도 섹션 높이가 크게 출렁이지 않게 한다. */
const FEED_LIMIT = RECENT_LIMIT;

/**
 * 컨플 홈 "Discover what's happening"의 피드 전환. 기본은 기존 "최근 업데이트"이고 선택은 URL(`?feed=`)에
 * 남겨 새로 고침·뒤로 가기·링크 공유에서 유지한다. 공개 문서 인스턴스는 구독 원장이 없어(서버 403)
 * 팔로잉을 빼고, `?feed=following`으로 와도 최근 업데이트로 보인다.
 */
type FeedKind = "recent" | "following" | "popular";
const FEED_OPTIONS: { kind: FeedKind; label: string }[] = [
  { kind: "recent", label: "최근 업데이트" },
  { kind: "following", label: "팔로잉" },
  { kind: "popular", label: "인기" },
];

type FeedState =
  | { kind: "loading" }
  | { kind: "ready"; rows: FeedPageRow[] }
  /** 아직 이 경로가 배포되지 않은 서버(404) — 빈 목록으로 꾸미지 않는다 */
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

interface RecentItem {
  page: PageNode;
  space: Space;
}

/** 카드에 필요한 것만 — 본문은 읽지 않는다(W-13: 예전엔 카드마다 본문 포함 getPage를 보냈다). */
interface ResumeItem {
  id: string;
  spaceId: string;
  title: string;
  /** 이 브라우저에 남은 방문 시각 — 서버 방문 원장에는 시각이 없어 있을 때만 보인다 */
  visitedAt?: string;
  space?: Space;
}

/**
 * 로딩 자리표시 — 실제 카드 그리드(.home-resume-grid)와 같은 셀 크기로 3장을 그려 콘텐츠가
 * 들어올 자리를 미리 예약한다(스피너만 띄우면 로드 완료 순간 레이아웃이 밀린다).
 * 시각 장식이므로 aria-hidden으로 접근성 트리에서 제외하고, 진행 상황은 role=status 문구로 알린다.
 */
function ResumeSkeleton() {
  return (
    <>
      <span className="wiki-visually-hidden" role="status">
        불러오는 중
      </span>
      <ul className="home-resume-grid" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="home-resume-card-skeleton">
            <span className="wiki-skeleton wiki-skeleton-line" style={{ width: "70%" }} />
            <span className="wiki-skeleton wiki-skeleton-line" style={{ width: "45%" }} />
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * 홈 대시보드 (`/wiki/home`, "추천") — 글로벌 셸(AppShell) 안의 본문 화면. 헤더·사이드바·만들기는
 * 셸이 담당하고, 이 컴포넌트는 순수 콘텐츠만 렌더한다(설계 §2 — 화면마다 다른 셸 금지).
 * MVP: "마지막 작업하던 곳에서 다시 시작"(최근 방문 카드). "최신 업데이트" 피드는 후속 슬라이스.
 */
export function HomePage() {
  const readOnly = useReadOnly();
  const personName = usePersonName();
  const navigate = useNavigate();
  const [resume, setResume] = useState<ResumeItem[] | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [recent, setRecent] = useState<RecentItem[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  /**
   * 홈 로드 실패 — 계정이 정지·비활성되면 서버가 모든 호출을 403 + 한국어 사유로 막는다(U4).
   * 삼키면 "최근 방문한 페이지가 없습니다"라는 거짓 빈 상태가 되므로 사유를 그대로 노출한다.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { starred } = useStarredSpaces();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFeed = searchParams.get("feed");
  const feed: FeedKind =
    requestedFeed === "popular" || (requestedFeed === "following" && !readOnly) ? requestedFeed : "recent";
  const feedOptions = readOnly ? FEED_OPTIONS.filter((o) => o.kind !== "following") : FEED_OPTIONS;
  const [feedState, setFeedState] = useState<FeedState>({ kind: "loading" });
  const [feedAttempt, setFeedAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const spaces = await listSpaces();
        if (active) setSpaces(spaces);
        const spaceById = new Map(spaces.map((s) => [s.id, s]));
        const visits = getRecentVisits(RESUME_LIMIT);
        const visitedAt = new Map(visits.map((v) => [v.id, v.at]));
        // 서버 방문 원장 우선 — 한 번의 요청이고 본문이 없으며, 사이드바 "최근"과 같은 목록이다.
        // 읽기 전용 인스턴스는 원장이 없고(익명), 목업은 null을 준다 → 브라우저 방문 기록으로 내려간다.
        const fromServer = readOnly ? null : await listRecentPages(RESUME_LIMIT).catch(() => null);
        if (!active) return;
        let items: ResumeItem[];
        if (fromServer !== null) {
          items = fromServer.map((row) => ({
            id: row.id,
            spaceId: row.spaceId,
            title: row.title,
            visitedAt: visitedAt.get(row.id),
            space: spaceById.get(row.spaceId),
          }));
        } else {
          // 폴백: 방문 로그 id로 하이드레이트(삭제된 페이지는 null → 제외). 동시 요청 수를 묶는다.
          const pages = await mapLimit(visits, 3, (v) => getPage(v.id).catch(() => null));
          if (!active) return;
          items = visits.flatMap((visit, i) => {
            const page = pages[i];
            return page
              ? [{ id: page.id, spaceId: page.spaceId, title: page.title, visitedAt: visit.at, space: spaceById.get(page.spaceId) }]
              : [];
          });
        }
        setResume(items);
      } catch (e: unknown) {
        if (!active) return;
        setLoadError(e instanceof Error ? e.message : "홈을 불러오지 못했습니다");
      }
    })();
    return () => {
      active = false;
    };
  }, [loadAttempt, readOnly]);

  // "최근 업데이트" — 스페이스별 최근 목록을 합쳐 시각 내림차순 상위 N. 한 스페이스가 실패해도
  // 나머지는 보여준다.
  useEffect(() => {
    if (spaces.length === 0) return;
    let active = true;
    void (async () => {
      const perSpace = await mapLimit(spaces, RECENT_CONCURRENCY, (space) =>
        listRecentlyUpdated(space.id, RECENT_PER_SPACE)
          .then((pages) => pages.map((page) => ({ page, space })))
          .catch(() => [] as RecentItem[]),
      );
      if (!active) return;
      const merged = perSpace
        .flat()
        .sort((a, b) => (b.page.updatedAt ?? "").localeCompare(a.page.updatedAt ?? ""))
        .slice(0, RECENT_LIMIT);
      setRecent(merged);
    })();
    return () => {
      active = false;
    };
  }, [spaces]);

  // 팔로잉·인기 — 스페이스를 가로지르는 한 요청이다(최근 업데이트처럼 스페이스마다 묻지 않는다).
  // 실패는 삼키지 않는다: 빈 목록으로 보이면 "구독한 것이 없다"는 거짓 안내가 된다.
  useEffect(() => {
    if (feed === "recent") return;
    let active = true;
    setFeedState({ kind: "loading" });
    const load = feed === "following" ? listFollowingFeed : listPopularFeed;
    void load(FEED_LIMIT)
      .then((rows) => {
        if (active) setFeedState(rows === null ? { kind: "unsupported" } : { kind: "ready", rows });
      })
      .catch((e: unknown) => {
        if (active) setFeedState({ kind: "error", message: e instanceof Error ? e.message : "피드를 불러오지 못했습니다" });
      });
    return () => {
      active = false;
    };
  }, [feed, feedAttempt]);

  const selectFeed = (kind: FeedKind) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (kind === "recent") next.delete("feed");
        else next.set("feed", kind);
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (readOnly) return; // 공개 문서에는 사람 이름을 싣지 않는다
    let active = true;
    void listUsers()
      .then((found) => {
        if (active) setUsers(found);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [readOnly]);

  // 별표한 스페이스가 먼저 — 디렉토리의 "자주 찾는 스페이스"와 같은 우선순위
  const orderedSpaces = [
    ...spaces.filter((s) => starred.includes(s.id)),
    ...spaces.filter((s) => !starred.includes(s.id)),
  ];

  if (loadError !== null) {
    return (
      <div className="page-view-error" role="alert">
        <p>{loadError}</p>
        <div className="page-view-error-actions">
          <Button
            variant="subtle"
            onClick={() => {
              setLoadError(null);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  return (
    /* AppShell의 .wiki-content가 이미 <main> 랜드마크다 — 여기서 또 <main>을 쓰면 랜드마크가
     * 중첩돼 스크린리더의 "본문" 지목이 모호해지고 HTML 규격도 위반한다(div로 유지). */
    <div className="home-content">
      <section className="home-section" aria-label="이어서 작업">
        <h2 className="home-section-title">마지막 작업하던 곳에서 다시 시작</h2>
        {resume === null ? (
          <ResumeSkeleton />
        ) : resume.length === 0 ? (
          <EmptyState
            media={<History size={32} aria-hidden="true" />}
            title="최근 방문한 페이지가 없습니다"
            description="페이지를 열면 여기에 다시 시작할 수 있게 나타납니다. 아래 스페이스에서 시작해 보세요."
          />
        ) : (
          <ul className="home-resume-grid">
            {resume.map(({ id, spaceId, title, visitedAt, space }) => (
              <li key={id}>
                <button
                  type="button"
                  className="home-resume-card"
                  onClick={() => navigate(`/spaces/${spaceId}/pages/${id}`)}
                >
                  <FileText className="home-resume-icon" size={18} aria-hidden="true" />
                  <TruncatedText className="home-resume-title" text={title} />
                  <span className="home-resume-meta">
                    {[space?.name, visitedAt ? `방문 ${relativeTime(visitedAt)}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 스페이스 진입점 — 홈이 방문 기록만 보여주면 처음 온 사용자는 빈 화면에서 시작할 곳이 없다.
        * 디렉토리(/spaces)의 요약판으로, 별표한 것이 앞에 온다. */}
      {spaces.length > 0 ? (
        <section className="home-section" aria-label="스페이스">
          <div className="home-section-head">
            <h2 className="home-section-title">스페이스</h2>
            <Link to="/spaces" className="home-section-link">
              모든 스페이스 보기
            </Link>
          </div>
          <ul className="home-space-grid">
            {orderedSpaces.map((space) => (
              <li key={space.id}>
                <button
                  type="button"
                  className="home-space-card"
                  aria-label={`${space.name} (${space.key})`}
                  onClick={() => navigate(`/spaces/${space.id}`)}
                >
                  <Avatar
                    className="home-space-card-avatar"
                    name={space.name}
                    color="auto"
                    size="medium"
                    aria-hidden="true"
                  />
                  <span className="home-space-card-text">
                    <TruncatedText className="home-space-card-name" text={space.name} />
                    <span className="home-space-card-key">{space.key}</span>
                  </span>
                  {starred.includes(space.id) ? (
                    <Star className="home-space-card-star" size={14} aria-hidden="true" fill="currentColor" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 전체 스페이스를 합친 최근 업데이트 — 스페이스 개요의 같은 목록에 스페이스 이름만 더 붙는다.
        * 위의 필 토글로 팔로잉·인기 피드와 바꿔 본다(컨플 홈 "Discover what's happening"). */}
      <section className="home-section" aria-label="최근 업데이트">
        <h2 className="home-section-title">최근 업데이트</h2>
        <div className="home-feed-toggle" role="group" aria-label="피드 보기">
          {feedOptions.map((option) => (
            <button
              key={option.kind}
              type="button"
              className="home-feed-pill"
              aria-pressed={feed === option.kind}
              onClick={() => selectFeed(option.kind)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {feed !== "recent" ? (
          <FeedList
            kind={feed}
            state={feedState}
            nameOf={(id) => personName(id, users)}
            onRetry={() => setFeedAttempt((attempt) => attempt + 1)}
          />
        ) : recent === null ? (
          <span className="wiki-visually-hidden" role="status">
            최근 업데이트 불러오는 중
          </span>
        ) : recent.length === 0 ? (
          <p className="home-recent-meta">아직 업데이트된 문서가 없습니다.</p>
        ) : (
          <ul className="home-recent">
            {recent.map(({ page, space }) => {
              const editorName = personName(page.updatedBy, users);
              const when = page.updatedAt ? relativeTime(page.updatedAt) : "";
              return (
                <li key={page.id} className="home-recent-item">
                  {page.type === "folder" ? (
                    <Folder className="home-recent-icon" size={16} aria-hidden="true" />
                  ) : (
                    <FileText className="home-recent-icon" size={16} aria-hidden="true" />
                  )}
                  <span className="home-recent-text">
                    <Link
                      to={contentPathIn(space.id, page)}
                      className="home-recent-link"
                      {...overflowTitleProps(page.title)}
                    >
                      {page.title}
                    </Link>
                    <span className="home-recent-meta">
                      {space.name}
                      {editorName ? ` · ${editorName}` : ""}
                    </span>
                  </span>
                  {when ? <span className="home-recent-time">{when}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 팔로잉·인기 피드 목록 — 최근 업데이트와 같은 행 모양에 스페이스 이름(행이 직접 싣는다)과 인기의 조회수를 더한다. */
function FeedList({
  kind,
  state,
  nameOf,
  onRetry,
}: {
  kind: Exclude<FeedKind, "recent">;
  state: FeedState;
  nameOf: (userId: string | null) => string | null;
  onRetry: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <span className="wiki-visually-hidden" role="status">
        피드 불러오는 중
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="home-feed-error" role="alert">
        <p className="home-recent-meta">피드를 불러오지 못했습니다: {state.message}</p>
        <Button variant="subtle" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    );
  }
  if (state.kind === "unsupported") {
    return <p className="home-recent-meta">이 서버는 아직 이 피드를 제공하지 않습니다.</p>;
  }
  if (state.rows.length === 0) {
    return kind === "following" ? (
      <p className="home-recent-meta">
        구독한 스페이스나 문서가 없습니다.{" "}
        <Link to="/spaces" className="home-section-link">
          스페이스 둘러보기
        </Link>
      </p>
    ) : (
      <p className="home-recent-meta">최근 90일 안에 수정된 문서가 없습니다.</p>
    );
  }
  return (
    <ul className="home-recent">
      {state.rows.map((row) => {
        const editorName = nameOf(row.updatedBy);
        const when = row.updatedAt ? relativeTime(row.updatedAt) : "";
        const meta = [row.spaceName, editorName, kind === "popular" ? `조회 ${row.viewCount}회` : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={row.id} className="home-recent-item">
            <FileText className="home-recent-icon" size={16} aria-hidden="true" />
            <span className="home-recent-text">
              <Link to={contentPathIn(row.spaceId, row)} className="home-recent-link" {...overflowTitleProps(row.title)}>
                {row.title}
              </Link>
              <span className="home-recent-meta">{meta}</span>
            </span>
            {when ? <span className="home-recent-time">{when}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
