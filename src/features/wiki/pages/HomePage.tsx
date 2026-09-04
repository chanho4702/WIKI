import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Avatar, EmptyState } from "@chanho/react";
import { FileText, Folder, History, Star } from "lucide-react";
import type { Page, PageNode, Space, User } from "../store/types";
import { getPage, listRecentlyUpdated, listSpaces, listUsers } from "../store/wikiStore";
import { getRecentVisits, type RecentVisit } from "../lib/recentVisits";
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

interface RecentItem {
  page: PageNode;
  space: Space;
}

interface ResumeItem {
  page: Page;
  visit: RecentVisit;
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
  const { starred } = useStarredSpaces();

  useEffect(() => {
    let active = true;
    void (async () => {
      const spaces = await listSpaces();
      if (active) setSpaces(spaces);
      const visits = getRecentVisits(6);
      // 방문 로그 id로 페이지를 병렬 하이드레이트(삭제된 페이지는 null → 제외)
      const pages = await Promise.all(visits.map((v) => getPage(v.id).catch(() => null)));
      if (!active) return;
      const spaceById = new Map(spaces.map((s) => [s.id, s]));
      const items: ResumeItem[] = visits
        .map((visit, i) => ({ visit, page: pages[i] }))
        .filter((x): x is { visit: RecentVisit; page: Page } => x.page !== null)
        .map((x) => ({ ...x, space: spaceById.get(x.page.spaceId) }));
      setResume(items);
    })();
    return () => {
      active = false;
    };
  }, []);

  // "최근 업데이트" — 스페이스별 최근 목록을 합쳐 시각 내림차순 상위 N. 한 스페이스가 실패해도
  // 나머지는 보여준다.
  useEffect(() => {
    if (spaces.length === 0) return;
    let active = true;
    void (async () => {
      const perSpace = await Promise.all(
        spaces.map((space) =>
          listRecentlyUpdated(space.id, RECENT_PER_SPACE)
            .then((pages) => pages.map((page) => ({ page, space })))
            .catch(() => [] as RecentItem[]),
        ),
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
            {resume.map(({ page, visit, space }) => (
              <li key={page.id}>
                <button
                  type="button"
                  className="home-resume-card"
                  onClick={() => navigate(`/spaces/${page.spaceId}/pages/${page.id}`)}
                >
                  <FileText className="home-resume-icon" size={18} aria-hidden="true" />
                  <TruncatedText className="home-resume-title" text={page.title} />
                  <span className="home-resume-meta">
                    {space ? `${space.name} · ` : ""}방문 {relativeTime(visit.at)}
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

      {/* 전체 스페이스를 합친 최근 업데이트 — 스페이스 개요의 같은 목록에 스페이스 이름만 더 붙는다 */}
      <section className="home-section" aria-label="최근 업데이트">
        <h2 className="home-section-title">최근 업데이트</h2>
        {recent === null ? (
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
