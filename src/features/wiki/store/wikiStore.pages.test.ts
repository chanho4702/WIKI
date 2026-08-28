import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createPage,
  getPage,
  listChildren,
  listVersions,
  recordPageView,
  setPageIcon,
} from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("listChildren / getPage", () => {
  /** 전량 조회는 없앴다(2026-08-29) — 트리는 한 단계씩 읽는다. */
  it("시드는 최상위 2개 아래로 깊이 3 트리를 이룬다", async () => {
    const roots = await listChildren("sp1", null);
    expect(roots.map((p) => p.id)).toEqual(["pg1", "pg2"]);
    expect(roots.map((p) => p.position)).toEqual([1, 2]);
    expect(roots.find((p) => p.id === "pg1")?.childCount).toBe(2);

    const children = await listChildren("sp1", "pg1");
    expect(children.map((p) => p.id)).toEqual(["pg3", "pg4"]);
    expect(await listChildren("sp1", "pg3")).toMatchObject([{ id: "pg5" }]); // 손자(깊이 3)
  });

  it("다른 스페이스의 페이지는 반환하지 않는다", async () => {
    await expect(listChildren("없는스페이스", null)).resolves.toEqual([]);
  });

  it("getPage는 존재하면 페이지를, 없으면 null을 반환한다", async () => {
    const page = await getPage("pg1");
    expect(page).toMatchObject({ id: "pg1", title: "시작하기", parentId: null });
    await expect(getPage("없는id")).resolves.toBeNull();
  });

  it("시드 pg1 본문에는 마크다운 예시(제목/목록/코드블록/표)가 들어 있다", async () => {
    const page = (await getPage("pg1"))!;
    expect(page.body).toContain("# 개발 위키에 오신 것을 환영합니다");
    expect(page.body).toContain("1. 저장소를 클론한다");
    expect(page.body).toContain("```ts");
    expect(page.body).toContain("| 명령어 | 설명 |");
  });

  it("시드 pg1에는 버전 2개가 최신순으로 들어 있고, v2가 현재 본문과 같다", async () => {
    const versions = await listVersions("pg1");
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0].id).toBe("pv2");
    expect(versions[0].body).toBe((await getPage("pg1"))!.body);
    expect(versions[1].body).not.toBe(versions[0].body);
  });
});

describe("createPage", () => {
  it("v1 스냅샷을 자동 생성한다", async () => {
    const page = await createPage({ spaceId: "sp1", title: "새 문서", body: "# 초안" });
    expect(page).toMatchObject({
      spaceId: "sp1",
      parentId: null,
      title: "새 문서",
      body: "# 초안",
      createdBy: "u1",
      updatedBy: "u1",
    });
    const versions = await listVersions(page.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      pageId: page.id,
      version: 1,
      title: "새 문서",
      body: "# 초안",
      savedBy: "u1",
    });
  });

  it("body 생략 시 빈 문자열로 생성한다", async () => {
    const page = await createPage({ spaceId: "sp1", title: "빈 문서" });
    expect(page.body).toBe("");
  });

  it("position은 형제 내 max+1이다 — 루트", async () => {
    const page = await createPage({ spaceId: "sp1", title: "세 번째 루트" });
    expect(page.position).toBe(3); // pg1=1, pg2=2 다음
  });

  it("position은 형제 내 max+1이다 — pg1의 하위", async () => {
    const page = await createPage({ spaceId: "sp1", parentId: "pg1", title: "세 번째 하위" });
    expect(page.parentId).toBe("pg1");
    expect(page.position).toBe(3); // pg3=1, pg4=2 다음
  });

  it("제목이 비어 있으면 거부한다", async () => {
    await expect(createPage({ spaceId: "sp1", title: "  " })).rejects.toThrow(
      "페이지 제목을 입력하세요",
    );
  });

  it("스페이스가 없으면 거부한다", async () => {
    await expect(createPage({ spaceId: "없는id", title: "문서" })).rejects.toThrow(
      "스페이스를 찾을 수 없습니다",
    );
  });

  it("부모 페이지가 없으면 거부한다", async () => {
    await expect(
      createPage({ spaceId: "sp1", parentId: "없는id", title: "문서" }),
    ).rejects.toThrow("부모 페이지를 찾을 수 없습니다");
  });
});

describe("setPageIcon / recordPageView", () => {
  it("이모지 설정은 버전 스냅샷 없이 영속되고, null로 해제된다", async () => {
    const before = await listVersions("pg1");
    const withIcon = await setPageIcon("pg1", "🚀");
    expect(withIcon.icon).toBe("🚀");
    expect((await getPage("pg1"))?.icon).toBe("🚀");
    // 메타데이터 변경 — 내용 버전이 쌓이지 않는다(movePage와 같은 취급)
    expect(await listVersions("pg1")).toHaveLength(before.length);
    const cleared = await setPageIcon("pg1", null);
    expect(cleared.icon).toBeNull();
  });

  it("recordPageView가 누적 조회수를 올리며 돌려준다", async () => {
    expect(await recordPageView("pg1")).toBe(1);
    expect(await recordPageView("pg1")).toBe(2);
    expect((await getPage("pg1"))?.views).toBe(2);
  });

  it("없는 페이지는 한국어 에러", async () => {
    await expect(setPageIcon("없음", "🚀")).rejects.toThrow("페이지를 찾을 수 없습니다");
    await expect(recordPageView("없음")).rejects.toThrow("페이지를 찾을 수 없습니다");
  });
});
