import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { Banner, Button, EmptyState, PageHeader, Table, Tabs } from "@chanho/react";
import { Clock, FilePen, Star } from "lucide-react";
import type { Space, StarredPageRow } from "../store/types";
import { getPage, listMyDrafts, listPagesByIds, listRecentPages } from "../store/wikiStore";
import { getRecentVisits } from "../lib/recentVisits";
import { relativeTime } from "../lib/relativeTime";
import { contentPathIn } from "../lib/contentPath";
import { mapLimit } from "../lib/mapLimit";
import { hydrateStarredPages, useStarredPages } from "../lib/starredPages";
import { useStarredSpaces } from "../lib/starredSpaces";

/**
 * 내 항목(`/my/:tab`, F-04) — 최근 방문·별표·내 초안 전체 목록. 컨플루언스 Home의 Recent·Starred·Drafts 탭.
 * 사이드바 플라이아웃은 몇 개만 보여 준다 — "전체 보기"가 여기로 온다. 탭은 URL에 남는다(공유·뒤로 가기).
 */
type MyTab = "recent" | "starred" | "drafts";

const TABS: MyTab[] = ["recent", "starred", "drafts"];
/** 서버 방문 원장 상한(PersonalService.RECENT_LIMIT)과 같다 — 더 달라고 해도 서버가 자른다. */
const RECENT_LIMIT = 20;
const DRAFT_LIMIT = 50;

interface Row {
  id: string;
  spaceId: string;
  spaceName: string | null;
  title: string;
  type: "page" | "folder" | "blog";
  visitedAt?: string;
}

function TitleLink({ row }: { row: Row }) {
  return (
    <Link to={contentPathIn(row.spaceId, { id: row.id, type: row.type })}>
      {row.title.trim() ? row.title : "제목 없음"}
    </Link>
  );
}

function fromRow(row: StarredPageRow, spaces: Map<string, Space>): Row {
  return {
    id: row.id,
    spaceId: row.spaceId,
    spaceName: row.spaceName ?? spaces.get(row.spaceId)?.name ?? null,
    title: row.title,
    type: row.type,
  };
}

/** 최근 방문 — 서버 원장 우선(기기를 옮겨도 이어진다), 없으면(목업) 이 브라우저 방문 기록. */
function RecentTab({ spaces }: { spaces: Map<string, Space> }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const visits = getRecentVisits(RECENT_LIMIT);
        const visitedAt = new Map(visits.map((v) => [v.id, v.at]));
        const fromServer = await listRecentPages(RECENT_LIMIT);
        if (!active) return;
        if (fromServer !== null) {
          setRows(fromServer.map((r) => ({ ...fromRow(r, spaces), visitedAt: visitedAt.get(r.id) })));
          return;
        }
        const pages = await mapLimit(visits, 4, (v) => getPage(v.id).catch(() => null));
        if (!active) return;
        setRows(visits.flatMap((visit, i) => {
          const page = pages[i];
          return page
            ? [{
                id: page.id, spaceId: page.spaceId, spaceName: spaces.get(page.spaceId)?.name ?? null,
                title: page.title, type: page.type, visitedAt: visit.at,
              }]
            : [];
        }));
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [spaces]);

  if (error !== null) return <Banner variant="danger">최근 방문을 불러오지 못했습니다: {error}</Banner>;
  if (rows !== null && rows.length === 0) {
    return <EmptyState media={<Clock size={32} aria-hidden="true" />} title="최근에 본 문서가 없습니다" />;
  }
  // 로딩 중에도 같은 표를 그린다 — 머리글은 그대로, 행 자리만 DS 스켈레톤(열 폭이 로드 전후로 같다)
  return (
    <Table<Row>
      aria-label="최근 방문 문서"
      loading={rows === null}
      loadingLabel="최근 방문 불러오는 중"
      rows={rows ?? []}
      columns={[
        { key: "title", header: "제목", render: (row) => <TitleLink row={row} /> },
        { key: "spaceName", header: "스페이스", render: (row) => row.spaceName ?? "" },
        { key: "visitedAt", header: "방문", render: (row) => (row.visitedAt ? relativeTime(row.visitedAt) : "") },
      ]}
    />
  );
}

/**
 * 별표 — 원장은 브라우저 사본(lib/starredPages, 앱 시작 때 서버와 동기화)이다. 별표 해제는 그 자리에서 되고
 * 사이드바·문서 헤더의 별과 같은 상태를 본다. 제목은 스페이스별로 서버에 다시 물어 최신화한다(개명 반영).
 */
function StarredTab({ spaces }: { spaces: Map<string, Space> }) {
  const { entries, toggle } = useStarredPages();
  const { starred: starredSpaceIds, toggle: toggleSpace } = useStarredSpaces();
  const known = entries.filter((e) => e.spaceId !== "");
  const spaceKey = [...new Set(known.map((e) => e.spaceId))].sort().join(",");

  useEffect(() => {
    const bySpace = new Map<string, string[]>();
    for (const e of known) bySpace.set(e.spaceId, [...(bySpace.get(e.spaceId) ?? []), e.id]);
    void mapLimit([...bySpace.entries()], 4, async ([spaceId, ids]) => {
      const nodes = await listPagesByIds(spaceId, ids).catch(() => null);
      if (nodes) hydrateStarredPages(spaceId, nodes);
    }).catch(() => {});
    // 별표한 스페이스 집합이 바뀔 때만 다시 묻는다(제목 갱신이 entries를 바꿔 다시 도는 것을 막는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceKey]);

  const rows: Row[] = known.map((e) => ({
    id: e.id,
    spaceId: e.spaceId,
    spaceName: spaces.get(e.spaceId)?.name ?? null,
    title: e.title,
    type: e.type ?? "page",
  }));
  const starredSpaces = starredSpaceIds.flatMap((id) => {
    const space = spaces.get(id);
    return space ? [space] : [];
  });

  if (rows.length === 0 && starredSpaces.length === 0) {
    return (
      <EmptyState
        media={<Star size={32} aria-hidden="true" />}
        title="별표한 항목이 없습니다"
        description="문서·스페이스의 별표(★)를 누르면 여기에 모입니다."
      />
    );
  }
  return (
    <div className="my-items-starred">
      {rows.length > 0 ? (
        <Table<Row>
          aria-label="별표한 문서"
          rows={rows}
          columns={[
            { key: "title", header: "제목", render: (row) => <TitleLink row={row} /> },
            { key: "spaceName", header: "스페이스", render: (row) => row.spaceName ?? "" },
            {
              key: "actions",
              header: "작업",
              align: "right",
              render: (row) => (
                <Button
                  size="small"
                  variant="subtle"
                  aria-label={`${row.title} 별표 해제`}
                  onClick={() => toggle({ id: row.id, spaceId: row.spaceId, title: row.title, type: row.type })}
                >
                  별표 해제
                </Button>
              ),
            },
          ]}
        />
      ) : null}
      {starredSpaces.length > 0 ? (
        <Table<Space>
          aria-label="별표한 스페이스"
          rows={starredSpaces}
          columns={[
            { key: "name", header: "스페이스", render: (space) => <Link to={`/spaces/${space.id}`}>{space.name}</Link> },
            { key: "key", header: "키" },
            {
              key: "actions",
              header: "작업",
              align: "right",
              render: (space) => (
                <Button
                  size="small"
                  variant="subtle"
                  aria-label={`${space.name} 별표 해제`}
                  onClick={() => toggleSpace(space.id)}
                >
                  별표 해제
                </Button>
              ),
            },
          ]}
        />
      ) : null}
    </div>
  );
}

/** 내 초안 — 서버가 초안을 작성자·관리자만 보이게 강제한다. 목록 API가 없는 서버(null)면 탭을 숨긴다. */
function DraftsTab({ rows, error }: { rows: Row[] | null; error: string | null }) {
  const navigate = useNavigate();
  if (error !== null) return <Banner variant="danger">내 초안을 불러오지 못했습니다: {error}</Banner>;
  if (rows !== null && rows.length === 0) {
    return (
      <EmptyState
        media={<FilePen size={32} aria-hidden="true" />}
        title="작성 중인 초안이 없습니다"
        description="만들기로 시작한 문서는 게시하기 전까지 여기에 남습니다. 초안은 나만 볼 수 있습니다."
      />
    );
  }
  return (
    <Table<Row>
      aria-label="내 초안"
      loading={rows === null}
      loadingLabel="내 초안 불러오는 중"
      rows={rows ?? []}
      columns={[
        { key: "title", header: "제목", render: (row) => <TitleLink row={row} /> },
        { key: "spaceName", header: "스페이스", render: (row) => row.spaceName ?? "" },
        {
          key: "actions",
          header: "작업",
          align: "right",
          render: (row) => (
            <Button
              size="small"
              variant="subtle"
              aria-label={`${row.title.trim() ? row.title : "제목 없음"} 이어서 편집`}
              onClick={() => navigate(`/spaces/${row.spaceId}/pages/${row.id}/edit`)}
            >
              이어서 편집
            </Button>
          ),
        },
      ]}
    />
  );
}

export function MyItemsPage({ spaces }: { spaces: Space[] }) {
  const { tab } = useParams();
  const navigate = useNavigate();
  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  // 초안 탭은 서버가 목록 API를 줄 때만 보인다 — 그래서 탭 구성을 정하려면 먼저 물어야 한다
  const [drafts, setDrafts] = useState<Row[] | null | undefined>(undefined);
  const [draftError, setDraftError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void listMyDrafts(DRAFT_LIMIT)
      .then((found) => {
        if (active) setDrafts(found === null ? null : found.map((r) => fromRow(r, new Map(spaces.map((s) => [s.id, s])))));
      })
      .catch((e: unknown) => {
        if (!active) return;
        setDrafts([]);
        setDraftError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [spaces]);

  if (!TABS.includes(tab as MyTab)) return <Navigate to="/my/recent" replace />;
  const draftsSupported = drafts !== null;
  if (tab === "drafts" && drafts === null) return <Navigate to="/my/recent" replace />;

  const items = [
    { value: "recent", label: "최근 방문", content: <RecentTab spaces={spaceById} /> },
    { value: "starred", label: "별표", content: <StarredTab spaces={spaceById} /> },
    ...(draftsSupported
      ? [{ value: "drafts", label: "내 초안", content: <DraftsTab rows={drafts ?? null} error={draftError} /> }]
      : []),
  ];

  return (
    <div className="my-items-page">
      <PageHeader title="내 항목" />
      <Tabs
        label="내 항목"
        items={items}
        value={tab}
        onValueChange={(next) => navigate(`/my/${next}`)}
      />
    </div>
  );
}
