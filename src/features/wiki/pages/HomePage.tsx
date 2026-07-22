import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button, EmptyState, Spinner } from "@chanho/react";
import { FileText, Plus } from "lucide-react";
import type { Page, Space } from "../store/types";
import { getPage, listSpaces } from "../store/wikiStore";
import { WikiTopBar } from "../components/WikiTopBar";
import { SpaceCreateModal } from "../components/SpaceCreateModal";
import { getRecentVisits, type RecentVisit } from "../lib/recentVisits";
import { relativeTime } from "../lib/relativeTime";

interface ResumeItem {
  page: Page;
  visit: RecentVisit;
  space?: Space;
}

/**
 * 홈 대시보드 (`/wiki/home`, "추천") — 스페이스 종속 사이드바 밖의 독립 라우트.
 * MVP: 상단바 + "마지막 작업하던 곳에서 다시 시작"(최근 방문 카드). "최신 업데이트" 피드는 후속 슬라이스.
 */
export function HomePage() {
  const navigate = useNavigate();
  const [resume, setResume] = useState<ResumeItem[] | null>(null);
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);

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
    <div className="home">
      <WikiTopBar
        create={
          <Button
            size="small"
            iconBefore={<Plus size={16} aria-hidden="true" />}
            onClick={() => setSpaceModalOpen(true)}
          >
            만들기
          </Button>
        }
      />
      <main className="home-content">
        <section className="home-section" aria-label="이어서 작업">
          <h2 className="home-section-title">마지막 작업하던 곳에서 다시 시작</h2>
          {resume === null ? (
            <Spinner size="small" label="불러오는 중" />
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
      </main>
      {/* 홈엔 현재 스페이스가 없어 만들기 = 새 스페이스. 항상 마운트(제어형). */}
      <SpaceCreateModal
        showTrigger={false}
        open={spaceModalOpen}
        onOpenChange={setSpaceModalOpen}
        onCreated={(space) => navigate(`/spaces/${space.id}`)}
      />
    </div>
  );
}
