import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, addComment, listComments, deleteComment, updateComment } from "./wikiStore";

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

  it("구버전 데이터(parentId/updatedAt 없는 코멘트)를 load 시 null로 정규화한다", async () => {
    localStorage.setItem(
      "wiki.v1",
      JSON.stringify({
        users: [{ id: "u1", name: "김찬호" }],
        spaces: [{ id: "sp1", key: "DEV", name: "개발 위키", createdAt: "2026-07-10T09:00:00.000Z" }],
        pages: [{ id: "pg1", spaceId: "sp1", parentId: null, title: "시작하기", body: "", position: 1, createdBy: "u1", updatedBy: "u1", createdAt: "2026-07-10T09:00:00.000Z", updatedAt: "2026-07-10T09:00:00.000Z" }],
        versions: [],
        comments: [{ id: "c1", pageId: "pg1", authorId: "u1", body: "구버전 코멘트", createdAt: "2026-07-10T11:00:00.000Z" }],
      }),
    );
    const comments = await listComments("pg1");
    expect(comments).toHaveLength(1);
    expect(comments[0].parentId).toBeNull();
    expect(comments[0].updatedAt).toBeNull();
  });
});

describe("comment replies & edit/delete (W4)", () => {
  it("parentId로 답글을 단다", async () => {
    const reply = await addComment("pg1", "답글입니다", "c1");
    expect(reply).toMatchObject({ pageId: "pg1", authorId: "u1", parentId: "c1" });
  });

  it("답글에 답글은 거부한다 (중첩 1단)", async () => {
    const reply = await addComment("pg1", "답글", "c1");
    await expect(addComment("pg1", "답답글", reply.id)).rejects.toThrow(
      "답글에는 답글을 달 수 없습니다",
    );
  });

  it("부모 코멘트가 다른 페이지에 있으면 거부한다", async () => {
    // c1은 pg1의 코멘트다
    await expect(addComment("pg2", "잘못된 답글", "c1")).rejects.toThrow(
      "부모 코멘트가 같은 페이지에 없습니다",
    );
  });

  it("없는 부모 코멘트면 거부한다", async () => {
    await expect(addComment("pg1", "답글", "없는id")).rejects.toThrow(
      "부모 코멘트를 찾을 수 없습니다",
    );
  });

  it("본인 코멘트를 수정하면 body와 updatedAt이 갱신된다", async () => {
    const mine = await addComment("pg2", "원본");
    const updated = await updateComment(mine.id, "  수정본  ");
    expect(updated.body).toBe("수정본");
    expect(updated.updatedAt).not.toBeNull();
  });

  it("무변경 수정은 no-op — updatedAt이 null로 남는다", async () => {
    const mine = await addComment("pg2", "그대로");
    const updated = await updateComment(mine.id, "그대로");
    expect(updated.updatedAt).toBeNull();
  });

  it("타인 코멘트 수정은 거부한다", async () => {
    // c1의 작성자는 u2, 현재 유저는 u1
    await expect(updateComment("c1", "가로채기")).rejects.toThrow(
      "본인의 코멘트만 수정할 수 있습니다",
    );
  });

  it("빈 본문 수정은 거부한다", async () => {
    const mine = await addComment("pg2", "원본");
    await expect(updateComment(mine.id, "   ")).rejects.toThrow("코멘트 내용을 입력하세요");
  });

  it("본인 코멘트를 삭제하면 그 답글도 연쇄 삭제된다", async () => {
    const mine = await addComment("pg2", "삭제될 코멘트");
    await addComment("pg2", "답글1", mine.id);
    await addComment("pg2", "답글2", mine.id);
    await deleteComment(mine.id);
    await expect(listComments("pg2")).resolves.toEqual([]);
  });

  it("타인 코멘트 삭제는 거부한다", async () => {
    await expect(deleteComment("c1")).rejects.toThrow("본인의 코멘트만 삭제할 수 있습니다");
  });

  it("없는 코멘트 수정/삭제는 거부한다", async () => {
    await expect(updateComment("없는id", "x")).rejects.toThrow("코멘트를 찾을 수 없습니다");
    await expect(deleteComment("없는id")).rejects.toThrow("코멘트를 찾을 수 없습니다");
  });
});
