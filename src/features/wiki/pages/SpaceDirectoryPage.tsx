import { useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, Table, TextField } from "@chanho/react";
import type { TableColumn } from "@chanho/react";
import type { Space } from "../store/types";
import { WikiTopBar } from "../components/WikiTopBar";
import { useStarredSpaces } from "../lib/starredSpaces";

export interface SpaceDirectoryPageProps {
  spaces: Space[];
}

/** 생성일 표기: PageViewPage.tsx의 formatDate와 동일 패턴 (2026-07-10T... → "2026년 7월 10일").
 * 두 곳뿐이라 lib 추출 없이 최소 변경으로 중복을 남겨 둔다(스펙 결정). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** 이름·키 부분 일치, 대소문자 무시 — SpaceFlyout.tsx의 matchesQuery와 동일 패턴. */
function matchesQuery(space: Space, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return space.name.toLowerCase().includes(q) || space.key.toLowerCase().includes(q);
}

/**
 * 스페이스 디렉토리 페이지 (`/spaces`, W7 T7) — 컨플루언스 "스페이스 디렉토리"의 축소판.
 * WikiLayout 밖의 독립 라우트라 사이드바가 없다(스페이스 종속 사이드바를 여기서 보여줄 근거가
 * 없다는 계획 결정) — WikiTopBar만 토글 없이 얹고 전폭 콘텐츠를 채운다.
 * "자주 찾는 스페이스"(별표된 것만, 카드 그리드)와 "모든 스페이스"(필터 가능한 테이블) 두 섹션.
 */
export function SpaceDirectoryPage({ spaces }: SpaceDirectoryPageProps) {
  const navigate = useNavigate();
  const { starred, toggle } = useStarredSpaces();
  const [query, setQuery] = useState("");

  const starredSpaces = spaces.filter((s) => starred.includes(s.id));
  const filtered = spaces.filter((s) => matchesQuery(s, query));

  const columns: TableColumn<Space>[] = [
    {
      key: "name",
      header: "스페이스 이름(키)",
      render: (space) => (
        <button
          type="button"
          className="space-directory-row-name"
          onClick={() => navigate(`/spaces/${space.id}`)}
        >
          {space.name} ({space.key})
        </button>
      ),
    },
    {
      key: "createdAt",
      header: "생성일",
      render: (space) => formatDate(space.createdAt),
    },
    {
      key: "starred",
      header: "별표",
      render: (space) => {
        const isStarred = starred.includes(space.id);
        return (
          <button
            type="button"
            className="space-directory-star"
            aria-pressed={isStarred}
            aria-label={`${space.name} 별표`}
            onClick={() => toggle(space.id)}
          >
            {isStarred ? "★" : "☆"}
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-directory">
      <WikiTopBar />
      <main className="space-directory-content">
        <h1>스페이스</h1>

        {starredSpaces.length > 0 && (
          <section className="space-directory-starred" aria-label="자주 찾는 스페이스">
            <h2>자주 찾는 스페이스</h2>
            <ul className="space-directory-cards">
              {starredSpaces.map((space) => (
                <li key={space.id} className="space-directory-card">
                  <button
                    type="button"
                    className="space-directory-card-name"
                    onClick={() => navigate(`/spaces/${space.id}`)}
                  >
                    <span className="space-directory-card-title">{space.name}</span>
                    <span className="space-directory-card-key">{space.key}</span>
                  </button>
                  <button
                    type="button"
                    className="space-directory-star"
                    aria-pressed={true}
                    aria-label={`${space.name} 별표`}
                    onClick={() => toggle(space.id)}
                  >
                    ★
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-directory-all" aria-label="모든 스페이스">
          <h2>모든 스페이스</h2>
          <TextField
            label="제목으로 필터링"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="스페이스 이름 또는 키"
          />
          {filtered.length === 0 ? (
            <EmptyState title="검색 결과 없음" description="다른 검색어를 입력해 보세요." />
          ) : (
            <Table columns={columns} rows={filtered} aria-label="모든 스페이스" />
          )}
        </section>
      </main>
    </div>
  );
}
