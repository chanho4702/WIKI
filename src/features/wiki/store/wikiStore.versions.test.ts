import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  addComment,
  deletePage,
  getPage,
  listVersions,
  restoreVersion,
  updatePage,
} from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("updatePage", () => {
  it("body 실변경 시 새 버전(max+1)을 스냅샷하고 updatedBy/updatedAt을 갱신한다", async () => {
    const before = (await getPage("pg1"))!; // 시드: updatedBy u2, 버전 2개
    const updated = await updatePage("pg1", { body: "# 완전히 새 본문" });
    expect(updated.body).toBe("# 완전히 새 본문");
    expect(updated.updatedBy).toBe("u1"); // 현재 유저로 갱신
    expect(updated.updatedAt).not.toBe(before.updatedAt);
    const versions = await listVersions("pg1");
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0]).toMatchObject({ title: "시작하기", body: "# 완전히 새 본문", savedBy: "u1" });
  });

  it("title만 변경해도 새 버전을 스냅샷한다", async () => {
    await updatePage("pg2", { title: "팀 그라운드 룰" });
    const versions = await listVersions("pg2");
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0].title).toBe("팀 그라운드 룰");
    expect(versions[1].title).toBe("팀 규칙");
  });

  it("둘 다 무변경이면 no-op — 버전·updatedAt 불변", async () => {
    const before = (await getPage("pg2"))!;
    const result = await updatePage("pg2", { title: before.title, body: before.body });
    expect(result.updatedAt).toBe(before.updatedAt);
    expect(await listVersions("pg2")).toHaveLength(1);
  });

  it("빈 patch도 no-op이다", async () => {
    const before = (await getPage("pg2"))!;
    const result = await updatePage("pg2", {});
    expect(result.updatedAt).toBe(before.updatedAt);
    expect(await listVersions("pg2")).toHaveLength(1);
  });

  it("제목을 빈 문자열로 바꾸려 하면 거부한다", async () => {
    await expect(updatePage("pg2", { title: "  " })).rejects.toThrow("페이지 제목을 입력하세요");
  });

  it("없는 페이지면 거부한다", async () => {
    await expect(updatePage("없는id", { title: "제목" })).rejects.toThrow(
      "페이지를 찾을 수 없습니다",
    );
  });
});

describe("deletePage", () => {
  it("하위 페이지가 있으면 거부한다", async () => {
    await expect(deletePage("pg1")).rejects.toThrow("하위 페이지가 있어 삭제할 수 없습니다");
    await expect(deletePage("pg3")).rejects.toThrow("하위 페이지가 있어 삭제할 수 없습니다");
  });

  it("리프 삭제 시 페이지·버전·코멘트를 연쇄 삭제한다", async () => {
    await addComment("pg5", "삭제 전 코멘트");
    await updatePage("pg5", { body: "## 수정된 본문" }); // 버전 2개로 만든 뒤 삭제
    await deletePage("pg5");
    expect(await getPage("pg5")).toBeNull();
    // 저장소 원본에서 잔여물이 실제로 제거됐는지 확인 (조회 API의 필터가 아니라)
    const raw = JSON.parse(localStorage.getItem("wiki.v1")!) as {
      pages: { id: string }[];
      versions: { pageId: string }[];
      comments: { pageId: string }[];
    };
    expect(raw.pages.some((p) => p.id === "pg5")).toBe(false);
    expect(raw.versions.some((v) => v.pageId === "pg5")).toBe(false);
    expect(raw.comments.some((c) => c.pageId === "pg5")).toBe(false);
  });

  it("없는 페이지면 거부한다", async () => {
    await expect(deletePage("없는id")).rejects.toThrow("페이지를 찾을 수 없습니다");
  });
});

describe("restoreVersion", () => {
  it("과거 버전 복원은 새 버전으로 쌓인다 — 히스토리가 끊기지 않는다", async () => {
    const v1 = (await listVersions("pg1")).find((v) => v.version === 1)!; // pv1
    const restored = await restoreVersion("pg1", v1.id);
    expect(restored.body).toBe(v1.body); // v1 내용으로 복원
    const versions = await listVersions("pg1");
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]); // v3가 새로 쌓임
    expect(versions[0].body).toBe(v1.body);
  });

  it("최신 버전과 같은 내용의 복원은 no-op이다 (updatePage 경로 재사용)", async () => {
    await restoreVersion("pg1", "pv2"); // pv2 = 현재 본문과 동일
    expect(await listVersions("pg1")).toHaveLength(2);
  });

  it("없는 버전이면 거부한다", async () => {
    await expect(restoreVersion("pg1", "없는id")).rejects.toThrow("버전을 찾을 수 없습니다");
  });

  it("다른 페이지의 버전 id로는 복원할 수 없다", async () => {
    await expect(restoreVersion("pg2", "pv1")).rejects.toThrow("버전을 찾을 수 없습니다");
  });
});
