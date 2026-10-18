import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { listBlogPostPage, listBlogPosts, searchContent, setTaskDone } from "./wikiApi";

afterEach(() => vi.restoreAllMocks());

const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("wikiApi 웨이브 2 계약", () => {
  it("작업 토글은 text를 줄 때만 싣는다", async () => {
    const task = { pageId: 1, spaceId: 2, spaceName: null, pageTitle: "T", lineNo: 3, text: "첫째", assigneeId: null, dueDate: null, done: true };
    const spy = vi.spyOn(client, "sharedApiFetch").mockImplementation(async () => res(200, task));
    await setTaskDone("1", 3, true, "첫째");
    await setTaskDone("1", 3, false);
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({ done: true, text: "첫째" });
    expect(JSON.parse(spy.mock.calls[1][1]!.body as string)).toEqual({ done: false });
  });

  it("작업 토글 409는 서버 문구 그대로 던진다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(409, { error: "그 줄의 작업 항목이 바뀌었습니다. 문서를 새로고침하세요" }));
    await expect(setTaskDone("1", 3, true, "옛 문구")).rejects.toThrow("그 줄의 작업 항목이 바뀌었습니다");
  });

  it("블로그 쪽은 X-Next-Before 헤더를 커서로 읽고, 헤더가 없으면 마지막 쪽", async () => {
    const row = { id: 9, title: "글", status: "published", icon: null, createdBy: 1, updatedBy: 1, createdAt: "", updatedAt: "", excerpt: "" };
    const spy = vi.spyOn(client, "sharedApiFetch")
      .mockResolvedValueOnce(res(200, [row], { "X-Next-Before": "9" }))
      .mockResolvedValueOnce(res(200, []));
    const first = await listBlogPostPage("2", { limit: 20 });
    expect(spy.mock.calls[0][0]).toBe("/api/wiki/spaces/2/blog?limit=20");
    expect(first).toMatchObject({ nextBefore: "9" });
    const last = await listBlogPostPage("2", { limit: 20, before: "9" });
    expect(spy.mock.calls[1][0]).toBe("/api/wiki/spaces/2/blog?before=9&limit=20");
    expect(last.nextBefore).toBeNull();
  });

  it("블로그 전체 목록은 파라미터 없이 부른다(예전 동작)", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValue(res(200, []));
    await listBlogPosts("2");
    expect(spy.mock.calls[0][0]).toBe("/api/wiki/spaces/2/blog");
  });

  it("검색은 pageTypes를 줄 때만 싣는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockImplementation(async () =>
      res(200, { data: { search: { total: 0, totalExact: true, tookMs: 0, hits: [] } } }));
    await searchContent({ query: "q", docTypes: ["PAGE"], pageTypes: ["BLOG"] });
    await searchContent({ query: "q" });
    const input0 = JSON.parse(spy.mock.calls[0][1]!.body as string).variables.input;
    const input1 = JSON.parse(spy.mock.calls[1][1]!.body as string).variables.input;
    expect(input0).toMatchObject({ docTypes: ["PAGE"], pageTypes: ["BLOG"] });
    expect(input1.pageTypes).toBeUndefined();
  });
});
