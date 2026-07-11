import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createPage,
  getPage,
  listPages,
  listVersions,
} from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("listPages / getPage", () => {
  it("시드에 페이지 5개가 position 오름차순으로, 깊이 3 트리로 들어 있다", async () => {
    const pages = await listPages("sp1");
    expect(pages).toHaveLength(5);
    // position 오름차순 (1,1,1,2,2 순 — 트리 구성은 화면 몫)
    expect(pages.map((p) => p.position)).toEqual([1, 1, 1, 2, 2]);
    const byId = new Map(pages.map((p) => [p.id, p]));
    expect(byId.get("pg3")?.parentId).toBe("pg1"); // 하위
    expect(byId.get("pg5")?.parentId).toBe("pg3"); // 손자 (깊이 3)
    expect(pages.filter((p) => p.parentId === null).map((p) => p.id)).toEqual(["pg1", "pg2"]);
  });

  it("다른 스페이스의 페이지는 반환하지 않는다", async () => {
    await expect(listPages("없는스페이스")).resolves.toEqual([]);
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
