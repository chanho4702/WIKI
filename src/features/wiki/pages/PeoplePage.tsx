import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Avatar, Banner, Button, EmptyState, Lozenge, Spinner, Table } from "@chanho/react";
import { FileText, UserX } from "lucide-react";
import type { PersonPageRow, PersonProfile } from "../store/types";
import { getPersonProfile, listPersonPages } from "../store/wikiStore";
import { contentPathIn } from "../lib/contentPath";
import { relativeTime } from "../lib/relativeTime";
import { isActiveMember } from "../lib/people";

/** 서버 상한(최대 50)보다 작게 — 컨플루언스 프로필의 "최근 작업"도 한 화면 분량만 보인다. */
const PAGE_LIMIT = 20;

type ProfileState =
  | { kind: "loading" }
  | { kind: "ready"; profile: PersonProfile }
  | { kind: "missing" }
  | { kind: "error"; message: string };

type PagesState =
  | { kind: "loading" }
  | { kind: "ready"; rows: PersonPageRow[] }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * 사람 프로필(`/people/:userId`, F-07) — 컨플루언스 People profile. 이름·아바타·이메일·소속 팀과 그 사람이
 * 최근 작업한 문서(내가 볼 수 있는 것만 — 서버가 보기 제한·초안 규칙으로 거른다). 이메일·팀은 조직 전원에게
 * 공개한다(사용자 결정). 비활성 구성원은 "비활성" 표시와 문서 목록만 보인다(AC).
 */
export function PeoplePage() {
  const { userId = "" } = useParams();
  const [profile, setProfile] = useState<ProfileState>({ kind: "loading" });
  const [pages, setPages] = useState<PagesState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setProfile({ kind: "loading" });
    setPages({ kind: "loading" });
    // 두 조회는 서로 기다리지 않는다(org-service·wiki-backend 각자) — 한쪽 장애가 다른 쪽을 가리지 않게 따로 받는다
    void getPersonProfile(userId)
      .then((found) => {
        if (active) setProfile(found ? { kind: "ready", profile: found } : { kind: "missing" });
      })
      .catch((e: unknown) => {
        if (active) setProfile({ kind: "error", message: message(e) });
      });
    void listPersonPages(userId, PAGE_LIMIT)
      .then((rows) => {
        if (active) setPages(rows === null ? { kind: "unsupported" } : { kind: "ready", rows });
      })
      .catch((e: unknown) => {
        if (active) setPages({ kind: "error", message: message(e) });
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  if (profile.kind === "loading") {
    return (
      <div className="people-page">
        <Spinner size="large" label="프로필 불러오는 중" />
      </div>
    );
  }
  if (profile.kind === "missing") {
    return (
      <div className="people-page">
        <EmptyState
          media={<UserX size={32} aria-hidden="true" />}
          title="사용자를 찾을 수 없습니다"
          description="조직에서 삭제됐거나 잘못된 주소입니다."
        />
      </div>
    );
  }
  if (profile.kind === "error") {
    return (
      <div className="people-page">
        <Banner variant="danger">프로필을 불러오지 못했습니다: {profile.message}</Banner>
        <Button variant="subtle" onClick={() => setAttempt((n) => n + 1)}>
          다시 시도
        </Button>
      </div>
    );
  }

  const person = profile.profile;
  const active = isActiveMember(person.status);
  return (
    <div className="people-page">
      <header className="people-header">
        <Avatar name={person.name} color="auto" size="large" aria-hidden="true" />
        <div className="people-ident">
          <h1 className="people-name">{person.name}</h1>
          {active ? (
            <dl className="people-facts">
              {person.email ? (
                <>
                  <dt>이메일</dt>
                  <dd>
                    <a href={`mailto:${person.email}`}>{person.email}</a>
                  </dd>
                </>
              ) : null}
              <dt>팀</dt>
              <dd>{person.teams.length > 0 ? person.teams.map((t) => t.name).join(" · ") : "소속 팀 없음"}</dd>
            </dl>
          ) : (
            <Lozenge appearance="neutral">비활성</Lozenge>
          )}
        </div>
      </header>
      <section className="people-section" aria-labelledby="people-pages-title">
        <h2 id="people-pages-title" className="people-section-title">
          최근 작업한 문서
        </h2>
        <PersonPages state={pages} name={person.name} />
      </section>
    </div>
  );
}

function PersonPages({ state, name }: { state: PagesState; name: string }) {
  if (state.kind === "loading") return <Spinner label="문서 불러오는 중" />;
  if (state.kind === "error") return <Banner variant="danger">문서 목록을 불러오지 못했습니다: {state.message}</Banner>;
  if (state.kind === "unsupported") {
    // 없는 기능을 빈 목록으로 꾸미지 않는다 — 서버가 사람별 문서 목록을 아직 주지 않는다
    return <Banner variant="info">이 서버는 아직 사람별 문서 목록을 제공하지 않습니다.</Banner>;
  }
  if (state.rows.length === 0) {
    return (
      <EmptyState
        media={<FileText size={32} aria-hidden="true" />}
        title="볼 수 있는 문서가 없습니다"
        description={`${name} 님이 만들거나 고친 문서 중 내가 볼 수 있는 것이 여기에 나옵니다.`}
      />
    );
  }
  return (
    <Table<PersonPageRow>
      aria-label={`${name} 님이 최근 작업한 문서`}
      rows={state.rows}
      columns={[
        {
          key: "title",
          header: "제목",
          render: (row) => (
            <span className="people-page-title">
              <Link to={contentPathIn(row.spaceId, { id: row.id, type: row.type })}>
                {row.title.trim() ? row.title : "제목 없음"}
              </Link>
              {/* 남의 초안이 보인다면 내가 그 스페이스·전역 관리자라서다 — 누구에게 보이는지는 문서 화면의 배지가 알린다 */}
              {row.status === "draft" ? <Lozenge appearance="info">초안</Lozenge> : null}
            </span>
          ),
        },
        { key: "spaceName", header: "스페이스", render: (row) => row.spaceName ?? "" },
        { key: "updatedAt", header: "수정", render: (row) => (row.updatedAt ? relativeTime(row.updatedAt) : "") },
      ]}
    />
  );
}
