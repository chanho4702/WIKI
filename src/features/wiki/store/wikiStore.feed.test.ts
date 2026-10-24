import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, createPage, getPage, listFollowingFeed, listPopularFeed } from "./wikiStore";
import type { WikiData } from "./types";

/* 홈 피드(2026-10-24) — 목업 계약(백엔드 `/api/wiki/feed/*`와 같은 규칙) */

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

function editData(fn: (data: WikiData) => void): void {
  const data = JSON.parse(localStorage.getItem("wiki.v1")!) as WikiData;
  fn(data);
  localStorage.setItem("wiki.v1", JSON.stringify(data));
  __resetForTest();
}

function touch(data: WikiData, id: string, views: number | undefined, ago: number) {
  const page = data.pages.find((p) => p.id === id)!;
  page.views = views;
  page.updatedAt = daysAgo(ago);
}

beforeEach(async () => {
  localStorage.clear();
  __resetForTest();
  await getPage("pg1"); // 시드 저장
});

describe("listPopularFeed(목업)", () => {
  it("최근 90일 안에 수정된 문서를 조회수 내림차순, 동률은 최근 수정순으로 준다", async () => {
    editData((d) => {
      touch(d, "pg1", 5, 10);
      touch(d, "pg2", 5, 2);
      touch(d, "pg3", 9, 30);
      touch(d, "pg4", 99, 91);
      touch(d, "pg5", undefined, 1);
    });
    const rows = await listPopularFeed(20);
    expect(rows?.map((r) => [r.id, r.viewCount])).toEqual([["pg3", 9], ["pg2", 5], ["pg1", 5], ["pg5", 0]]);
    expect(rows?.[0]).toMatchObject({ spaceName: "개발 위키", status: "published", updatedBy: "u2" });
    expect(await listPopularFeed(1)).toHaveLength(1);
  });

  it("초안·보관·폴더는 빼고 볼 수 있는 것만 준다", async () => {
    const draft = await createPage({ spaceId: "sp1", title: "초안", body: "", status: "draft" });
    const folder = await createPage({ spaceId: "sp1", title: "폴더", body: "", type: "folder" });
    editData((d) => {
      touch(d, "pg1", 1, 1);
      d.pages.find((p) => p.id === "pg1")!.archivedAt = daysAgo(0);
    });
    const ids = (await listPopularFeed())?.map((r) => r.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(folder.id);
    expect(ids).not.toContain("pg1");
  });
});

describe("listFollowingFeed(목업)", () => {
  it("구독한 스페이스의 문서 + 구독한 문서(하위 아님)를 최근 수정순으로", async () => {
    editData((d) => {
      d.watches = { pg1: ["u1"] }; // pg1의 하위(pg3·pg4)는 따라오지 않는다
      d.spaceWatches = {};
      touch(d, "pg1", 0, 5);
    });
    expect((await listFollowingFeed())?.map((r) => r.id)).toEqual(["pg1"]);

    editData((d) => {
      d.spaceWatches = { sp1: ["u1"] };
    });
    const ids = (await listFollowingFeed())?.map((r) => r.id);
    expect(ids?.[0]).toBe("pg1");
    expect(ids).toEqual(expect.arrayContaining(["pg2", "pg3", "pg4", "pg5"]));
  });

  it("남이 구독한 것은 내 피드가 아니다", async () => {
    editData((d) => {
      d.watches = { pg2: ["u2"] };
      d.spaceWatches = { sp1: ["u3"] };
    });
    expect(await listFollowingFeed()).toEqual([]);
  });
});
