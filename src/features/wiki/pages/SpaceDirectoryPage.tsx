import { useState } from "react";
import { useNavigate } from "react-router";
import { Avatar, EmptyState, Table, TextField } from "@chanho/react";
import type { TableColumn } from "@chanho/react";
import type { Space } from "../store/types";
import { WikiTopBar } from "../components/WikiTopBar";
import { useStarredSpaces } from "../lib/starredSpaces";

export interface SpaceDirectoryPageProps {
  spaces: Space[];
}

/** 이름·키 부분 일치, 대소문자 무시 — SpaceFlyout.tsx의 matchesQuery와 동일 패턴. */
function matchesQuery(space: Space, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return space.name.toLowerCase().includes(q) || space.key.toLowerCase().includes(q);
}

/**
 * 스페이스 디렉토리 페이지 (`/spaces`) — 컨플루언스 "스페이스 디렉토리" 복제(`space 페이지.png`).
 * "자주 찾는 스페이스"(별표된 것, 카드) + "모든 스페이스"(테이블: Space name·Labels·Owner·Actions).
 * Labels/Owner는 백엔드가 주지 않아 각각 빈칸/"Not available"로 둔다(설계 §1.3).
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
      header: "Space name",
      render: (space) => (
        <button
          type="button"
          className="space-directory-row-name"
          aria-label={`${space.name} (${space.key})`}
          onClick={() => navigate(`/spaces/${space.id}`)}
        >
          <Avatar name={space.name} color="auto" size="small" />
          <span>{space.name}</span>
        </button>
      ),
    },
    // 백엔드 Space에 labels/owner가 없다 → 빈칸/"Not available"(설계 §1.3, 후속 백엔드 필드)
    { key: "labels", header: "Labels", render: () => <span className="space-directory-muted">—</span> },
    {
      key: "owner",
      header: "Owner",
      render: () => <span className="space-directory-muted">Not available</span>,
    },
    {
      key: "actions",
      header: "Actions",
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
                  <Avatar
                    className="space-directory-card-avatar"
                    name={space.name}
                    color="auto"
                    size="medium"
                  />
                  <button
                    type="button"
                    className="space-directory-card-name"
                    aria-label={`${space.name} (${space.key})`}
                    onClick={() => navigate(`/spaces/${space.id}`)}
                  >
                    <span className="space-directory-card-title">{space.name}</span>
                    <span className="space-directory-card-sub">{space.key}</span>
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
