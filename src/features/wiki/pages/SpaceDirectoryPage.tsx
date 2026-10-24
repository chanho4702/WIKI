import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Avatar, EmptyState, Select, Table, TextField } from "@chanho/react";
import { Star } from "lucide-react";
import type { TableColumn } from "@chanho/react";
import type { Space, User } from "../store/types";
import { listUsers } from "../store/wikiStore";
import { useStarredSpaces } from "../lib/starredSpaces";
import { usePersonName } from "../lib/userName";
import { useReadOnly } from "../lib/readOnly";
import { TruncatedText } from "../components/TruncatedText";

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
 * Select는 빈 문자열 value를 못 쓴다(DS 규칙) — "모든 라벨"의 자리표시 값. 라벨은 정규화로 언제나
 * 소문자이므로 대문자를 넣으면 실제 라벨과 겹칠 수 없다.
 */
const LABEL_ANY = "ALL_LABELS";

/**
 * 스페이스 디렉토리 페이지 (`/spaces`) — 컨플루언스 "스페이스 디렉토리" 복제(`space 페이지.png`).
 * "자주 찾는 스페이스"(별표된 것, 카드) + "모든 스페이스"(테이블: Space name·Labels·Owner·Actions).
 * Labels는 스페이스 라벨(V41 — 문서 라벨이 아니다, 컨플루언스의 스페이스 카테고리)이고 라벨로
 * 거를 수 있다(`?label=` — 공유·뒤로가기가 되게 주소에 둔다). Owner는 개인 스페이스(ownerId)만
 * 이름을 보인다(설계 §1.3).
 */
export function SpaceDirectoryPage({ spaces }: SpaceDirectoryPageProps) {
  const readOnly = useReadOnly();
  const personName = usePersonName();
  const navigate = useNavigate();
  const { starred, toggle } = useStarredSpaces();
  const [query, setQuery] = useState("");
  const [params, setParams] = useSearchParams();
  const labelFilter = params.get("label") ?? "";
  const setLabelFilter = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("label", value);
    else next.delete("label");
    setParams(next, { replace: true });
  };
  // 소유자 열 — 개인 스페이스의 ownerId를 이름으로. 실패해도 표는 뜨고 `사용자 #id` 폴백으로 간다.
  const [users, setUsers] = useState<User[]>([]);
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

  const starredSpaces = spaces.filter((s) => starred.includes(s.id));
  /** 필터 후보 — 지금 보이는 스페이스들에 실제로 붙은 라벨만, 이름순(코드유닛: 칩 순서와 같다). */
  const allLabels = useMemo(
    () => [...new Set(spaces.flatMap((s) => s.labels ?? []))].sort(),
    [spaces],
  );
  const filtered = spaces.filter(
    (s) => matchesQuery(s, query) && (labelFilter === "" || (s.labels ?? []).includes(labelFilter)),
  );

  // 별표는 쓰기다(서버 원장 + 브라우저 사본). 읽기 전용에서는 토글도 목록도 두지 않는다 —
  // /docs와 /wiki가 같은 오리진이면 localStorage를 공유해 남의 별표가 공개 화면에 새어 든다.
  const columns: TableColumn<Space>[] = [
    {
      key: "name",
      header: "스페이스 이름",
      render: (space) => (
        <button
          type="button"
          className="space-directory-row-name"
          aria-label={`${space.name} (${space.key})`}
          onClick={() => navigate(`/spaces/${space.id}`)}
        >
          <Avatar name={space.name} color="auto" size="small" />
          <TruncatedText text={space.name} />
        </button>
      ),
    },
    // 스페이스 라벨(V41). 칩을 누르면 그 라벨로 거른다 — 라벨이 탐색축이 아니면 장식일 뿐이다.
    // 나머지 UI가 전부 한국어라 머리글도 한국어로(휴리스틱 #4).
    {
      key: "labels",
      header: "라벨",
      render: (space) => {
        const labels = space.labels ?? [];
        if (labels.length === 0) return <span className="space-directory-muted">—</span>;
        return (
          <ul className="space-directory-labels" aria-label={`${space.name} 라벨`}>
            {labels.map((label) => (
              <li key={label}>
                <button
                  type="button"
                  className={label === labelFilter ? "label-chip label-chip-active" : "label-chip"}
                  aria-pressed={label === labelFilter}
                  aria-label={`라벨 ${label}로 거르기`}
                  onClick={() => setLabelFilter(label === labelFilter ? "" : label)}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        );
      },
    },
    {
      key: "owner",
      header: "소유자",
      // 개인 스페이스(W23)만 주인이 있다 — 팀 스페이스는 빈칸. "Not available" 같은 상태 문구는
      // 값이 아니라 결함처럼 읽힌다.
      render: (space) => {
        if (!space.ownerId) return <span className="space-directory-muted">—</span>;
        const name = personName(space.ownerId, users);
        return name ? <span>{name}</span> : null;
      },
    },
    ...(readOnly
      ? []
      : [
          {
            key: "actions",
            header: "작업",
            render: (space: Space) => {
              const isStarred = starred.includes(space.id);
              return (
                <button
                  type="button"
                  className="space-directory-star"
                  aria-pressed={isStarred}
                  aria-label={`${space.name} 별표`}
                  onClick={() => toggle(space.id)}
                >
                  {/* 채움=별표됨 / 외곽=미별표 — 색만이 아니라 형태로 상태 구분(WCAG 1.4.1) */}
                  <Star size={16} aria-hidden="true" fill={isStarred ? "currentColor" : "none"} />
                </button>
              );
            },
          },
        ]),
  ];

  return (
    /* AppShell의 .wiki-content가 이미 <main> 랜드마크다 — 중첩하면 스크린리더의 "본문" 지목이
     * 모호해지고 HTML 규격도 위반한다(HomePage와 동일 이유로 div). */
    <div className="space-directory-content">
      <h1>스페이스</h1>

      {!readOnly && starredSpaces.length > 0 && (
        <section className="space-directory-starred" aria-label="자주 찾는 스페이스">
          <h2>자주 찾는 스페이스</h2>
          <ul className="space-directory-cards">
            {starredSpaces.map((space) => (
              // 캡처(space 페이지.png): [정사각 아이콘 타일 좌상단 ↔ 별표 우상단] + [이름] 세로 배치
              <li key={space.id} className="space-directory-card">
                <div className="space-directory-card-top">
                  <Avatar
                    className="space-directory-card-icon"
                    name={space.name}
                    color="auto"
                    size="large"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    className="space-directory-star"
                    aria-pressed={true}
                    aria-label={`${space.name} 별표`}
                    onClick={() => toggle(space.id)}
                  >
                    <Star size={16} aria-hidden="true" fill="currentColor" />
                  </button>
                </div>
                <button
                  type="button"
                  className="space-directory-card-name"
                  aria-label={`${space.name} (${space.key})`}
            title={space.ownerId ? "개인 스페이스" : undefined}
                  onClick={() => navigate(`/spaces/${space.id}`)}
                >
                  {space.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-directory-all" aria-label="모든 스페이스">
        <h2>모든 스페이스</h2>
        <div className="space-directory-filters">
          <TextField
            className="space-directory-filter"
            label="제목으로 필터링"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="스페이스 이름 또는 키"
          />
          {/* 라벨이 하나도 없으면 고를 것이 없는 셀렉트를 두지 않는다(빈 상태는 표의 "—"가 말한다) */}
          {allLabels.length > 0 || labelFilter !== "" ? (
            <Select
              className="space-directory-label-filter"
              label="라벨"
              searchable
              searchPlaceholder="라벨 찾기"
              value={labelFilter === "" ? LABEL_ANY : labelFilter}
              options={[
                { value: LABEL_ANY, label: "모든 라벨" },
                // 주소로 들어온 라벨이 지금 목록에 없어도 선택 상태를 보여 준다(풀 수 있어야 한다)
                ...(labelFilter !== "" && !allLabels.includes(labelFilter) ? [labelFilter] : []).concat(allLabels)
                  .map((label) => ({ value: label, label })),
              ]}
              onValueChange={(next: string) => setLabelFilter(next === LABEL_ANY ? "" : next)}
            />
          ) : null}
        </div>
        {filtered.length === 0 ? (
          labelFilter !== "" ? (
            <EmptyState
              title="이 라벨의 스페이스가 없습니다"
              description={`‘${labelFilter}’ 라벨이 붙은 스페이스${query.trim() ? " 중 검색어와 맞는 것" : ""}이 없습니다.`}
              primaryAction={{ label: "라벨 필터 지우기", onClick: () => setLabelFilter("") }}
            />
          ) : (
            <EmptyState title="검색 결과 없음" description="다른 검색어를 입력해 보세요." />
          )
        ) : (
          <Table columns={columns} rows={filtered} aria-label="모든 스페이스" />
        )}
      </section>
    </div>
  );
}
