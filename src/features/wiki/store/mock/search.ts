// 통합 검색 목업 — 백엔드와 같은 필터·정렬 규칙.
import type { SearchContentInput, SearchHit, SearchResults } from "../types";
import { canSeePage, load } from "./db";
import { normalizeLabel } from "./labels";

function highlightSnippet(text: string, query: string): string | null {
  const index = text.toLocaleLowerCase("ko-KR").indexOf(query.toLocaleLowerCase("ko-KR"));
  if (index < 0) return null;
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + query.length + 100);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, index)}<em>${text.slice(index, index + query.length)}</em>${text.slice(index + query.length, end)}${suffix}`;
}

/** ISO 시각 또는 날짜(2026-08-01)를 밀리초로. 잘못된 값은 백엔드처럼 거부한다. */
function toBoundaryMillis(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(parsed)) throw new Error("기간은 날짜 형식이어야 합니다");
  return parsed;
}

/** 목업 모드도 화면과 같은 검색 계약을 제공한다. 첨부파일은 목업 스토리지가 없어 PAGE만 검색한다. */
export async function searchContent(input: SearchContentInput): Promise<SearchResults> {
  const query = input.query.trim();
  if (!query) return { total: 0, totalExact: true, tookMs: 0, hits: [] };

  const data = load();
  const spaces = new Map(data.spaces.map((space) => [space.id, space]));
  const allowedSpaces = input.spaceIds ? new Set(input.spaceIds) : null;
  const pagesRequested = !input.docTypes || input.docTypes.length === 0 || input.docTypes.includes("PAGE");
  // 작성자·기간 필터(W22) — 백엔드와 같은 규칙이다. 경계는 포함이고, 날짜만 오면 그 날의 시작으로 읽는다.
  const authors = input.authorIds?.length ? new Set(input.authorIds) : null;
  const after = toBoundaryMillis(input.updatedAfter);
  const before = toBoundaryMillis(input.updatedBefore);
  // 라벨은 저장할 때와 같은 규칙으로 정규화해 맞춘다 — 대소문자만 달라 안 걸리면 사용자는 이유를 모른다.
  const sort = input.sort ?? "RELEVANCE";
  const wantedLabels = input.labels?.length
    ? new Set(input.labels.map(normalizeLabel).filter((name) => name.length > 0))
    : null;
  const pageHits: SearchHit[] = !pagesRequested
    ? []
    : data.pages.flatMap((page): SearchHit[] => {
        // 초안은 요청이 includeDrafts일 때만, 그리고 볼 수 있는 초안(작성자·전역 관리자)만 — 서버 라이트 검색과 같다
        if (page.status === "draft" && !(input.includeDrafts === true && canSeePage(data, page))) return [];
        if (page.archivedAt || (allowedSpaces && !allowedSpaces.has(page.spaceId))) return [];
        if (authors && !authors.has(page.updatedBy)) return [];
        if (wantedLabels && !(data.labels?.[page.id] ?? []).some((name) => wantedLabels.has(name))) return [];
        const updatedMillis = Date.parse(page.updatedAt);
        if (after !== null && !(updatedMillis >= after)) return [];
        if (before !== null && !(updatedMillis <= before)) return [];
        const space = spaces.get(page.spaceId);
        if (!space) return [];
        const titleHighlight = highlightSnippet(page.title, query);
        const bodyHighlight = page.type === "page" ? highlightSnippet(page.body, query) : null;
        if (!titleHighlight && !bodyHighlight) return [];
        return [{
          id: page.id,
          docType: "PAGE",
          spaceId: page.spaceId,
          spaceKey: space.key,
          spaceName: space.name,
          pageId: null,
          pageType: page.type === "folder" ? "FOLDER" : page.type === "blog" ? "BLOG" : "PAGE",
          title: page.title,
          filename: null,
          highlights: [titleHighlight, bodyHighlight].filter((value): value is string => value !== null),
          updatedAt: page.updatedAt,
          score: (titleHighlight ? 3 : 0) + (bodyHighlight ? 1 : 0),
        }];
      });

  // 정렬은 백엔드와 같은 규칙이다 — 동점은 방향을 따라 id로 가른다(페이지를 넘길 때 순서가 흔들리면 안 된다).
  pageHits.sort((a, b) => {
    if (sort === "UPDATED_DESC") {
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || b.id.localeCompare(a.id);
    }
    if (sort === "UPDATED_ASC") {
      return (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "") || a.id.localeCompare(b.id);
    }
    return b.score - a.score || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || b.id.localeCompare(a.id);
  });
  const page = Math.max(input.page ?? 0, 0);
  const size = Math.max(0, Math.min(input.size ?? 20, 100));
  return {
    total: pageHits.length,
    totalExact: true,
    tookMs: 0,
    hits: pageHits.slice(page * size, (page + 1) * size),
  };
}
