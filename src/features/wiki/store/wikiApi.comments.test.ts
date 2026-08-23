import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

function mockApiFetch(status: number, body: unknown) {
  return vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
afterEach(() => vi.restoreAllMocks());

const COMMENT_DTO = {
  id: 31,
  pageId: 7,
  parentId: null,
  authorId: 1,
  authorName: "Alice",
  body: "첫 댓글",
  createdAt: "2026-08-23T10:00:00Z",
  updatedAt: null,
};

describe("wikiApi.listComments", () => {
  it("GET 결과를 Comment[]로 매핑 — id는 string, updatedAt null 유지", async () => {
    mockApiFetch(200, [COMMENT_DTO, { ...COMMENT_DTO, id: 32, parentId: 31, updatedAt: "2026-08-23T11:00:00Z" }]);
    const { listComments } = await import("./wikiApi");
    const comments = await listComments("7");
    expect(comments[0]).toMatchObject({
      id: "31",
      pageId: "7",
      parentId: null,
      authorId: "1",
      authorName: "Alice",
      updatedAt: null,
    });
    expect(comments[1]).toMatchObject({ id: "32", parentId: "31", updatedAt: "2026-08-23T11:00:00Z" });
  });
});

describe("wikiApi.addComment", () => {
  it("POST 본문에 body와 숫자 parentId를 보낸다", async () => {
    const spy = mockApiFetch(201, { ...COMMENT_DTO, id: 33, parentId: 31, body: "답글" });
    const { addComment } = await import("./wikiApi");
    const comment = await addComment("7", "답글", "31");
    expect(spy).toHaveBeenCalledWith(
      "/api/wiki/pages/7/comments",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({ body: "답글", parentId: 31 });
    expect(comment).toMatchObject({ id: "33", parentId: "31", body: "답글" });
  });

  it("최상위 댓글은 parentId null로 보내고, 서버 오류 문구를 그대로 던진다", async () => {
    const spy = mockApiFetch(400, { error: "답글에는 답글을 달 수 없습니다" });
    const { addComment } = await import("./wikiApi");
    await expect(addComment("7", "깊은 답글", "32")).rejects.toThrow("답글에는 답글을 달 수 없습니다");
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string).parentId).toBe(32);
  });
});

describe("wikiApi.updateComment / deleteComment", () => {
  it("PUT은 body만 보내고 응답을 매핑한다", async () => {
    const spy = mockApiFetch(200, { ...COMMENT_DTO, body: "고침", updatedAt: "2026-08-23T12:00:00Z" });
    const { updateComment } = await import("./wikiApi");
    const comment = await updateComment("31", "고침");
    expect(spy).toHaveBeenCalledWith("/api/wiki/comments/31", expect.objectContaining({ method: "PUT" }));
    expect(comment.updatedAt).toBe("2026-08-23T12:00:00Z");
  });

  it("DELETE 204를 성공으로 처리하고 403 문구를 그대로 던진다", async () => {
    const spy = mockApiFetch(204, null);
    const { deleteComment } = await import("./wikiApi");
    await expect(deleteComment("31")).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith("/api/wiki/comments/31", expect.objectContaining({ method: "DELETE" }));

    vi.restoreAllMocks();
    mockApiFetch(403, { error: "본인의 코멘트만 삭제할 수 있습니다" });
    await expect(deleteComment("31")).rejects.toThrow("본인의 코멘트만 삭제할 수 있습니다");
  });
});
