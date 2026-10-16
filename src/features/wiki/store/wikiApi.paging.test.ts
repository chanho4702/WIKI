import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

/**
 * 쪽 목록·스페이스 라벨 어댑터(2026-10) — 경로·쿼리·응답 모양을 백엔드 계약과 1:1로 고정한다.
 * (백엔드: RevisionController.page, CommentController.threads, SpaceController.setLabels)
 */
function once(status: number, body: unknown) {
  return vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
afterEach(() => vi.restoreAllMocks());

describe("wikiApi 이력 쪽 목록", () => {
  it("listVersionPage → /revisions/paged?before&limit, 메타를 PageVersion으로", async () => {
    const spy = once(200, {
      items: [{ version: 7, editedBy: 9, createdAt: "2026-10-01T00:00:00Z", changeNote: "정리", editedByName: "김" }],
      nextBefore: 7,
      total: 240,
    });
    const { listVersionPage } = await import("./wikiApi");
    const page = await listVersionPage("3", { before: 8, limit: 1 });
    expect(spy).toHaveBeenCalledWith("/api/wiki/pages/3/revisions/paged?before=8&limit=1");
    expect(page.total).toBe(240);
    expect(page.nextBefore).toBe(7);
    expect(page.versions[0]).toMatchObject({
      id: "3:7",
      version: 7,
      savedBy: "9",
      savedByName: "김",
      savedAt: "2026-10-01T00:00:00Z",
      changeNote: "정리",
      body: "",
    });
  });

  it("첫 쪽은 쿼리 없이 부른다", async () => {
    const spy = once(200, { items: [], nextBefore: null, total: 0 });
    const { listVersionPage } = await import("./wikiApi");
    expect(await listVersionPage("3")).toEqual({ versions: [], nextBefore: null, total: 0 });
    expect(spy).toHaveBeenCalledWith("/api/wiki/pages/3/revisions/paged");
  });

  it("getVersionByNumber는 본문과 함께 시각·요약을 싣고, 없는 번호는 null", async () => {
    once(200, {
      version: 3, title: "t", content: "본문", editedBy: 2, editedByName: null,
      createdAt: "2026-09-01T00:00:00Z", changeNote: null,
    });
    const { getVersionByNumber } = await import("./wikiApi");
    expect(await getVersionByNumber("5", 3)).toMatchObject({
      id: "5:3", body: "본문", savedAt: "2026-09-01T00:00:00Z", changeNote: undefined,
    });
    once(404, { error: "리비전 없음: v99" });
    expect(await getVersionByNumber("5", 99)).toBeNull();
  });
});

describe("wikiApi 댓글 스레드 쪽 목록", () => {
  it("listCommentThreads → /comments/threads?kind&before&limit, 커서·건수를 그대로", async () => {
    const spy = once(200, {
      items: [
        { id: 11, pageId: 3, parentId: null, authorId: 7, authorName: "a", body: "루트", createdAt: "2026-10-02T00:00:00Z", anchorType: "page" },
        { id: 12, pageId: 3, parentId: 11, authorId: 8, authorName: "b", body: "답글", createdAt: "2026-10-03T00:00:00Z", anchorType: "page" },
      ],
      nextBefore: "1790000000.0~11",
      threadCount: 30,
      commentCount: 41,
    });
    const { listCommentThreads } = await import("./wikiApi");
    const page = await listCommentThreads("3", { kind: "inline", before: "1.5~9", limit: 5 });
    expect(spy).toHaveBeenCalledWith("/api/wiki/pages/3/comments/threads?kind=inline&before=1.5%7E9&limit=5");
    expect(page).toMatchObject({ nextBefore: "1790000000.0~11", threadCount: 30, commentCount: 41 });
    expect(page.comments.map((c) => [c.id, c.parentId])).toEqual([["11", null], ["12", "11"]]);
  });
});

describe("wikiApi 스페이스 라벨", () => {
  it("setSpaceLabels → PUT /spaces/{id}/labels, 응답의 정규화된 라벨을 쓴다", async () => {
    const spy = once(200, { id: 4, key: "eng", name: "개발", description: null, ownerId: null, labels: ["a", "b-c"] });
    const { setSpaceLabels } = await import("./wikiApi");
    const space = await setSpaceLabels("4", ["A", "b c"]);
    expect(spy).toHaveBeenCalledWith("/api/wiki/spaces/4/labels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels: ["A", "b c"] }),
    });
    expect(space.labels).toEqual(["a", "b-c"]);
  });

  it("labels가 없는 구버전 응답은 빈 배열로 접는다", async () => {
    once(200, [{ id: 1, key: "dev", name: "개발" }]);
    const { listSpaces } = await import("./wikiApi");
    expect((await listSpaces())[0].labels).toEqual([]);
  });
});
