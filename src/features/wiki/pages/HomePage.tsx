import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState } from "@chanho/react";
import { FileText } from "lucide-react";
import type { Page, Space } from "../store/types";
import { getPage, listSpaces } from "../store/wikiStore";
import { getRecentVisits, type RecentVisit } from "../lib/recentVisits";
import { relativeTime } from "../lib/relativeTime";

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
  const navigate = useNavigate();
  const [resume, setResume] = useState<ResumeItem[] | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const spaces = await listSpaces();
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
            title="최근 방문한 페이지가 없습니다"
            description="페이지를 열면 여기에 다시 시작할 수 있게 나타납니다."
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
                  <span className="home-resume-title">{page.title}</span>
                  <span className="home-resume-meta">
                    {space ? `${space.name} · ` : ""}방문 {relativeTime(visit.at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {/* "최신 업데이트" 피드는 다음 슬라이스(listVersions 기반, 설계 §10) */}
    </div>
  );
}
