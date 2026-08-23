import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

function mockApiFetch(status: number, body: unknown) {
  return vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("wikiApi.searchContent", () => {
  it("GraphQL 계약에 pageType을 요청하고 페이지·크기를 전달한다", async () => {
    const spy = mockApiFetch(200, {
      data: {
        search: {
          total: 1,
          tookMs: 3,
          hits: [{
            id: "9",
            docType: "PAGE",
            spaceId: "1",
            spaceKey: "dev",
            spaceName: "개발",
            pageId: null,
            pageType: "FOLDER",
            title: "운영 런북",
            filename: null,
            highlights: ["<em>운영</em> 런북"],
            updatedAt: "2026-08-15T00:00:00Z",
            score: 2.5,
          }],
        },
      },
    });
    const { searchContent } = await import("./wikiApi");

    const result = await searchContent({ query: "  운영  ", page: 2, size: 10 });

    expect(result.hits[0]).toMatchObject({ id: "9", pageType: "FOLDER" });
    expect(spy).toHaveBeenCalledWith("/api/search/graphql", expect.objectContaining({ method: "POST" }));
    const request = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(request.query).toContain("pageType");
    expect(request.variables.input).toMatchObject({ query: "운영", page: 2, size: 10 });
  });

  it("HTTP 200의 SERVICE_UNAVAILABLE GraphQL 오류를 503 검색 오류로 올린다", async () => {
    mockApiFetch(200, {
      errors: [{ extensions: { code: "SERVICE_UNAVAILABLE", httpStatus: 503 } }],
    });
    const { searchContent } = await import("./wikiApi");

    await expect(searchContent({ query: "검색" })).rejects.toMatchObject({
      kind: "unavailable",
      message: "검색 서비스를 사용할 수 없습니다. 잠시 후 다시 시도하세요.",
    });
  });

  it("Gateway 429를 재시도 안내가 있는 rate-limited 오류로 바꾼다", async () => {
    mockApiFetch(429, { error: "Too Many Requests" });
    const { searchContent } = await import("./wikiApi");

    await expect(searchContent({ query: "검색" })).rejects.toMatchObject({
      kind: "rate-limited",
      message: "검색 요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
    });
  });

  it("공백 검색어는 네트워크 요청 없이 빈 결과를 반환한다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch");
    const { searchContent } = await import("./wikiApi");

    await expect(searchContent({ query: "   " })).resolves.toEqual({ total: 0, tookMs: 0, hits: [] });
    expect(spy).not.toHaveBeenCalled();
  });
});
