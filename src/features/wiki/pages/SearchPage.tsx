import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Banner, Button, EmptyState, Lozenge, PageHeader, Spinner } from "@chanho/react";
import { FileText, Folder, Paperclip, SearchX } from "lucide-react";
import { listPagePaths, listUsers, searchContent, suggestLabels } from "../store/wikiStore";
import {
  ContentSearchError,
  type LabelCount,
  type SearchHit,
  type SearchResults,
  type SearchSort,
  type User,
} from "../store/types";
import { SearchHighlights } from "../components/SearchHighlights";

const PAGE_SIZE = 20;

function resultPath(hit: SearchHit): string {
  if (hit.docType === "ATTACHMENT") {
    return hit.pageId ? `/spaces/${hit.spaceId}/pages/${hit.pageId}` : `/spaces/${hit.spaceId}`;
  }
  return hit.pageType === "FOLDER"
    ? `/spaces/${hit.spaceId}/folder/${hit.id}`
    : `/spaces/${hit.spaceId}/pages/${hit.id}`;
}

function resultLabel(hit: SearchHit): string {
  if (hit.docType === "ATTACHMENT") return "첨부파일";
  return hit.pageType === "FOLDER" ? "폴더" : "페이지";
}

function resultIcon(hit: SearchHit) {
  if (hit.docType === "ATTACHMENT") return <Paperclip size={18} aria-hidden="true" />;
  if (hit.pageType === "FOLDER") return <Folder size={18} aria-hidden="true" />;
  return <FileText size={18} aria-hidden="true" />;
}

/** URL의 sort 값은 사용자가 손댈 수 있다 — 모르는 값이면 조용히 기본값으로 돌린다. */
function normalizedSort(value: string | null): SearchSort {
  return value === "UPDATED_DESC" || value === "UPDATED_ASC" ? value : "RELEVANCE";
}

function normalizedPage(value: string | null): number {
  const page = Number(value ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").trim();
  const page = normalizedPage(params.get("page"));
  /**
   * 필터는 URL에 남긴다(W22) — 걸러진 결과를 그대로 공유·북마크할 수 있어야 하고,
   * 뒤로 가기가 필터를 잃으면 사용자는 처음부터 다시 좁혀야 한다.
   */
  const authorId = params.get("author") ?? "";
  const updatedAfter = params.get("after") ?? "";
  const updatedBefore = params.get("before") ?? "";
  const labelParam = params.get("labels") ?? "";
  const sort = normalizedSort(params.get("sort"));
  const labels = labelParam.split(",").map((name) => name.trim()).filter((name) => name !== "");
  const [users, setUsers] = useState<User[]>([]);
  const [labelOptions, setLabelOptions] = useState<LabelCount[]>([]);
  /** 결과의 조상 경로. 검색 엔진을 타지 않는 별도 조회라 두 배포에서 같은 답이 온다. */
  const [paths, setPaths] = useState<Map<string, string[]>>(new Map());
  /**
   * 라벨만 입력 중인 값을 따로 들고 있다가 제출할 때 URL에 반영한다 — 날짜·작성자와 달리
   * 자유 입력이라 키 하나마다 검색을 쏘면 "설계"를 치는 동안 요청이 두 번 더 나간다.
   */
  const [labelDraft, setLabelDraft] = useState(labelParam);
  const [retryKey, setRetryKey] = useState(0);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState<ContentSearchError | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);

  // 뒤로 가기·필터 지우기로 URL이 바뀌면 입력칸도 따라와야 한다.
  useEffect(() => {
    setLabelDraft(labelParam);
  }, [labelParam]);

  useEffect(() => {
    if (!query) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void searchContent({
      query,
      page: page - 1,
      size: PAGE_SIZE,
      ...(authorId ? { authorIds: [authorId] } : {}),
      ...(labels.length ? { labels } : {}),
      ...(updatedAfter ? { updatedAfter } : {}),
      ...(updatedBefore ? { updatedBefore } : {}),
      sort,
    })
      .then((nextResults) => {
        if (!cancelled) setResults(nextResults);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setResults(null);
        setError(
          reason instanceof ContentSearchError
            ? reason
            : new ContentSearchError("검색 결과를 불러올 수 없습니다. 다시 시도하세요.", "unknown"),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, query, retryKey, authorId, updatedAfter, updatedBefore, labelParam, sort]);

  /**
   * 라벨 후보 — 자유 입력만 두면 오타를 쳤을 때 0건이 나오고 사용자는 이유를 알 수 없다.
   * datalist라 직접 입력도 계속 가능하다(후보에 없는 라벨을 막지 않는다).
   */
  useEffect(() => {
    let cancelled = false;
    void suggestLabels(labelDraft.split(",").pop() ?? "")
      .then((found) => {
        if (!cancelled) setLabelOptions(found);
      })
      .catch(() => {
        if (!cancelled) setLabelOptions([]); // 후보를 못 받는다고 검색을 막지 않는다
      });
    return () => {
      cancelled = true;
    };
  }, [labelDraft]);

  // 결과가 바뀌면 그 페이지들의 경로만 조회한다 — 목록 한 페이지분(최대 20건)이다.
  useEffect(() => {
    const pageIds = (results?.hits ?? [])
      .map((hit) => (hit.docType === "ATTACHMENT" ? hit.pageId : hit.id))
      .filter((id): id is string => id !== null);
    if (pageIds.length === 0) {
      setPaths(new Map());
      return;
    }
    let cancelled = false;
    void listPagePaths(pageIds)
      .then((found) => {
        if (!cancelled) setPaths(new Map(found.map((row) => [row.id, row.titles])));
      })
      .catch(() => {
        if (!cancelled) setPaths(new Map()); // 경로를 못 받는다고 결과를 감추지 않는다
      });
    return () => {
      cancelled = true;
    };
  }, [results]);

  /** 필터를 바꾸면 1페이지로 돌아간다 — 5페이지에서 좁히면 결과가 없어 빈 화면만 보인다. */
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  };

  const filtered =
    authorId !== "" ||
    updatedAfter !== "" ||
    updatedBefore !== "" ||
    labelParam !== "" ||
    sort !== "RELEVANCE";

  const movePage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setParams(next);
  };

  const hasNextPage = results !== null && page * PAGE_SIZE < results.total;

  return (
    <section className="search-page" aria-labelledby="search-page-title">
      <div id="search-page-title">
        <PageHeader title="검색" />
      </div>

      {query ? (
        <div className="search-filters">
          <label className="search-filter">
            <span>작성자</span>
            <select value={authorId} onChange={(e) => setFilter("author", e.target.value)}>
              <option value="">전체</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="search-filter">
            <span>수정일 시작</span>
            <input
              type="date"
              value={updatedAfter}
              onChange={(e) => setFilter("after", e.target.value)}
            />
          </label>
          <label className="search-filter">
            <span>수정일 끝</span>
            <input
              type="date"
              value={updatedBefore}
              onChange={(e) => setFilter("before", e.target.value)}
            />
          </label>
          <form
            className="search-filter"
            onSubmit={(e) => {
              e.preventDefault();
              setFilter("labels", labelDraft.trim());
            }}
          >
            <label htmlFor="search-filter-labels">라벨</label>
            <input
              id="search-filter-labels"
              type="text"
              list="search-filter-label-options"
              value={labelDraft}
              placeholder="쉼표로 구분"
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => setFilter("labels", labelDraft.trim())}
            />
            <datalist id="search-filter-label-options">
              {labelOptions.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.count}건
                </option>
              ))}
            </datalist>
          </form>
          <label className="search-filter">
            <span>정렬</span>
            <select value={sort} onChange={(e) => setFilter("sort", e.target.value)}>
              <option value="RELEVANCE">관련도</option>
              <option value="UPDATED_DESC">최근 수정순</option>
              <option value="UPDATED_ASC">오래된 수정순</option>
            </select>
          </label>
          {filtered ? (
            <Button
              size="small"
              variant="subtle"
              onClick={() => {
                const next = new URLSearchParams(params);
                ["author", "after", "before", "labels", "sort", "page"].forEach((k) => next.delete(k));
                setParams(next);
              }}
            >
              필터 지우기
            </Button>
          ) : null}
        </div>
      ) : null}

      {!query ? (
        <EmptyState
          title="검색어를 입력하세요"
          description="상단 검색창에서 페이지 제목, 본문, 폴더와 첨부파일명을 검색할 수 있습니다."
          media={<SearchX size={32} aria-hidden="true" />}
        />
      ) : null}

      {loading ? (
        <div className="search-page-state" role="status">
          <Spinner size="large" label={`‘${query}’ 검색 중`} />
          <span>검색 중…</span>
        </div>
      ) : null}

      {!loading && error ? (
        <Banner
          variant={error.kind === "rate-limited" ? "warning" : "danger"}
          action={{ label: "다시 시도", onClick: () => setRetryKey((value) => value + 1) }}
        >
          {error.message}
        </Banner>
      ) : null}

      {!loading && !error && results?.total === 0 ? (
        <EmptyState
          title="검색 결과가 없습니다"
          description={`‘${query}’와 일치하는 공개 문서를 찾지 못했습니다.`}
          media={<SearchX size={32} aria-hidden="true" />}
        />
      ) : null}

      {!loading && !error && results && results.total > 0 ? (
        <>
          <div className="search-result-summary" role="status">
            <strong>‘{query}’ 검색 결과</strong>
            <span>
              {results.total.toLocaleString("ko-KR")}
              {results.totalExact ? "개" : "개 이상"}
            </span>
          </div>
          {/* 결과 목록에 이름을 준다 — 페이지 안에 목록이 여럿이라 스크린리더가 구분해야 한다 */}
          <ol className="search-result-list" aria-label="검색 결과">
            {results.hits.map((hit) => {
              const title = hit.docType === "ATTACHMENT" ? hit.filename : hit.title;
              const ownerId = hit.docType === "ATTACHMENT" ? hit.pageId : hit.id;
              // 스페이스명 뒤에 조상 제목을 잇는다. 스페이스 키를 붙이던 자리인데, 이름 옆의 키는
              // 같은 말을 두 번 하는 것이라 "어디에 있는 문서인가"를 알려주지 못했다.
              const trail = [hit.spaceName, ...(ownerId ? (paths.get(ownerId) ?? []) : [])];
              return (
                <li key={`${hit.docType}:${hit.id}`} className="search-result-item">
                  <Link className="search-result-link" to={resultPath(hit)}>
                    <span className="search-result-icon">{resultIcon(hit)}</span>
                    <span className="search-result-copy">
                      <span className="search-result-heading">
                        <strong>{title ?? "제목 없음"}</strong>
                        <Lozenge appearance="neutral">{resultLabel(hit)}</Lozenge>
                      </span>
                      <span className="search-result-path">
                        {trail.map((step, i) => (
                          <span key={`${step}:${i}`}>
                            {i > 0 ? <span aria-hidden="true"> / </span> : null}
                            {step}
                          </span>
                        ))}
                      </span>
                      <SearchHighlights highlights={hit.highlights} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <nav className="search-pagination" aria-label="검색 결과 페이지">
            <Button
              variant="ghost"
              size="small"
              disabled={page <= 1}
              onClick={() => movePage(page - 1)}
            >
              이전
            </Button>
            <span>{page}페이지</span>
            <Button
              variant="ghost"
              size="small"
              disabled={!hasNextPage}
              onClick={() => movePage(page + 1)}
            >
              다음
            </Button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
