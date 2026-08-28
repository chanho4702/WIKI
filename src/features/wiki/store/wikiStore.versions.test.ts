import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  addComment,
  deletePage,
  getPage,
  listChildren,
  listVersions,
  restoreVersion,
  updatePage,
} from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** 저장소 원본 — 조회 API의 필터가 아니라 실제로 지워졌는지 보려고 읽는다. */
function readRaw() {
  return JSON.parse(localStorage.getItem("wiki.v1")!) as {
    pages: { id: string }[];
    versions: { pageId: string }[];
    comments: { pageId: string }[];
  };
}

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

  it("두 편집 세션 중 오래된 버전은 거부하고 먼저 저장된 내용을 보존한다", async () => {
    const sessionA = await getPage("pg2");
    const sessionB = await getPage("pg2");
    expect(sessionA).not.toBeNull();
    expect(sessionB).not.toBeNull();

    const savedByB = await updatePage(
      "pg2",
      { title: "B가 먼저 저장" },
      { expectedVersion: sessionB!.version },
    );
    await expect(updatePage(
      "pg2",
      { title: "A의 오래된 편집" },
      { expectedVersion: sessionA!.version },
    )).rejects.toThrow("다른 사용자가 먼저 저장했습니다");

    expect(await getPage("pg2")).toMatchObject({
      title: "B가 먼저 저장",
      version: savedByB.version,
    });
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

// P2 결정(2026-07-28): 자식이 있으면 거부하는 대신, 호출측이 처리 방식을 고른다.
// 옵션을 주지 않으면 기존 거부 그대로 — 화면이 명시적으로 고를 때만 자식을 건드린다.
describe("deletePage — 자식 처리 선택", () => {
  it("promote: 자식을 삭제 대상의 부모로 올리고 대상만 지운다", async () => {
    // 시드 트리 pg1 → pg3 → pg5. pg3을 지우면 pg5는 pg1의 자식이 된다.
    await deletePage("pg3", { children: "promote" });

    expect(await getPage("pg3")).toBeNull();
    const pg5 = await getPage("pg5");
    expect(pg5).not.toBeNull();
    expect(pg5!.parentId).toBe("pg1"); // 조부모에게 승격
  });

  it("promote: 승격된 자식이 삭제된 자리의 position을 이어받고 형제가 1..n으로 재부여된다", async () => {
    // 시드: pg1 아래 pg3(1) · pg4(2), pg3 아래 pg5. pg3을 지우면 pg5가 pg3의 자리로 올라온다.
    await deletePage("pg3", { children: "promote" });

    const children = await listChildren("sp1", "pg1");
    expect(children.map((p) => p.id)).toEqual(["pg5", "pg4"]); // 뒤 형제 pg4는 뒤에 남는다
    expect(children.map((p) => p.position)).toEqual([1, 2]); // 1..n 연속
  });

  it("promote: 대상의 버전·코멘트만 지우고 승격된 자식의 것은 보존한다", async () => {
    await addComment("pg5", "자식 코멘트는 남아야 한다");
    await addComment("pg3", "대상 코멘트는 지워져야 한다");

    await deletePage("pg3", { children: "promote" });

    const raw = readRaw();
    expect(raw.comments.some((c) => c.pageId === "pg3")).toBe(false);
    expect(raw.versions.some((v) => v.pageId === "pg3")).toBe(false);
    expect(raw.comments.some((c) => c.pageId === "pg5")).toBe(true);
    expect(raw.versions.some((v) => v.pageId === "pg5")).toBe(true);
  });

  it("cascade: 후손 전부와 각자의 버전·코멘트를 지운다", async () => {
    await addComment("pg5", "손자 코멘트");

    // 시드: pg1 → {pg3 → pg5, pg4}. 손자까지 전부 후손이다.
    await deletePage("pg1", { children: "cascade" });

    const doomed = ["pg1", "pg3", "pg4", "pg5"];
    for (const id of doomed) {
      expect(await getPage(id)).toBeNull();
    }
    const raw = readRaw();
    expect(raw.pages.some((p) => doomed.includes(p.id))).toBe(false);
    expect(raw.versions.some((v) => doomed.includes(v.pageId))).toBe(false);
    expect(raw.comments.some((c) => doomed.includes(c.pageId))).toBe(false);
    // 다른 가지(루트 pg2)는 손대지 않는다
    expect(await getPage("pg2")).not.toBeNull();
  });

  it("자식이 없으면 두 옵션 다 리프 삭제와 같다", async () => {
    await deletePage("pg5", { children: "promote" });
    expect(await getPage("pg5")).toBeNull();
    await deletePage("pg4", { children: "cascade" });
    expect(await getPage("pg4")).toBeNull();
  });

  it("cascade: parentId가 순환하는 손상 데이터에서도 무한 루프하지 않는다", async () => {
    // movePage 순환 가드와 같은 방어 — 저장소를 직접 손상시켜 재현한다
    await listChildren("sp1", null); // 시드를 localStorage에 내려놓는다
    const raw = readRaw() as unknown as { pages: { id: string; parentId: string | null }[] };
    const byId = new Map(raw.pages.map((p) => [p.id, p]));
    byId.get("pg1")!.parentId = "pg5"; // pg1 → pg3 → pg5 → pg1 순환
    localStorage.setItem("wiki.v1", JSON.stringify(raw));
    __resetForTest();

    await deletePage("pg3", { children: "cascade" });
    expect(await getPage("pg3")).toBeNull();
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
