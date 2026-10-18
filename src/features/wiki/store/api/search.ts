// 통합 검색(GraphQL)(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { ContentSearchError, type SearchContentInput, type SearchResults } from "../types";

const SEARCH_OPERATION = `
  query WikiSearch($input: SearchInput!) {
    search(input: $input) {
      total
      totalExact
      tookMs
      hits {
        id
        docType
        spaceId
        spaceKey
        spaceName
        pageId
        pageType
        title
        filename
        highlights
        updatedAt
        score
      }
    }
  }
`;

interface GraphQlSearchResponse {
  data?: { search?: SearchResults };
  errors?: Array<{
    extensions?: { code?: string; httpStatus?: number };
  }>;
}

function contentSearchError(status: number, code?: string): ContentSearchError {
  if (status === 429) {
    return new ContentSearchError("검색 요청이 너무 많습니다. 잠시 후 다시 시도하세요.", "rate-limited");
  }
  if (status === 503 || code === "SERVICE_UNAVAILABLE") {
    return new ContentSearchError("검색 서비스를 사용할 수 없습니다. 잠시 후 다시 시도하세요.", "unavailable");
  }
  if (status === 401) {
    return new ContentSearchError("로그인이 만료되었습니다. 다시 로그인하세요.", "unauthorized");
  }
  return new ContentSearchError("검색 결과를 불러올 수 없습니다. 다시 시도하세요.", "unknown");
}

/** Gateway `/api/search/graphql` 계약. HTTP 200 안의 GraphQL errors도 성공으로 삼키지 않는다. */
export async function searchContent(input: SearchContentInput): Promise<SearchResults> {
  const query = input.query.trim();
  if (!query) return { total: 0, totalExact: true, tookMs: 0, hits: [] };

  const res = await sharedApiFetch("/api/search/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "WikiSearch",
      query: SEARCH_OPERATION,
      variables: {
        input: {
          query,
          page: input.page ?? 0,
          size: input.size ?? 20,
          ...(input.spaceIds ? { spaceIds: input.spaceIds } : {}),
          ...(input.docTypes ? { docTypes: input.docTypes } : {}),
          ...(input.includeDrafts ? { includeDrafts: true } : {}),
          ...(input.authorIds?.length ? { authorIds: input.authorIds } : {}),
          ...(input.updatedAfter ? { updatedAfter: input.updatedAfter } : {}),
          ...(input.updatedBefore ? { updatedBefore: input.updatedBefore } : {}),
          ...(input.labels?.length ? { labels: input.labels } : {}),
          ...(input.sort && input.sort !== "RELEVANCE" ? { sort: input.sort } : {}),
        },
      },
    }),
  });

  const body = (await res.json().catch(() => ({}))) as GraphQlSearchResponse;
  if (!res.ok) throw contentSearchError(res.status);
  const graphQlError = body.errors?.[0];
  if (graphQlError) {
    throw contentSearchError(
      graphQlError.extensions?.httpStatus ?? 500,
      graphQlError.extensions?.code,
    );
  }
  if (!body.data?.search) throw contentSearchError(500);
  return body.data.search;
}

// ── 마이그레이션(M1, 컨플루언스 DC) ────────────────────────────
/*
 * 계약: 설계 §1.3. 원본 토큰은 **요청 본문에만** 실린다 — 쿼리스트링(로그·리퍼러에 남는다)이나
 * 헤더로 보내지 않고, 응답에도 오지 않으며, 화면·목업 어디에도 저장하지 않는다(P8).
 */
