import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, addComment, listComments } from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("comments", () => {
  it("시드 pg1 코멘트 2개를 createdAt 오름차순으로 반환한다", async () => {
    const comments = await listComments("pg1");
    expect(comments.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(comments[0].authorId).toBe("u2");
  });

  it("코멘트 없는 페이지는 빈 배열을 반환한다", async () => {
    await expect(listComments("pg2")).resolves.toEqual([]);
  });

  it("addComment는 현재 유저(u1)로 코멘트를 추가하고 목록에 반영한다", async () => {
    const comment = await addComment("pg2", "  규칙 좋네요  ");
    expect(comment).toMatchObject({ pageId: "pg2", authorId: "u1", body: "규칙 좋네요" });
    const comments = await listComments("pg2");
    expect(comments.map((c) => c.id)).toEqual([comment.id]);
  });

  it("빈 본문이면 거부한다", async () => {
    await expect(addComment("pg1", "   ")).rejects.toThrow("코멘트 내용을 입력하세요");
  });

  it("없는 페이지면 거부한다", async () => {
    await expect(addComment("없는id", "본문")).rejects.toThrow("페이지를 찾을 수 없습니다");
  });
});
