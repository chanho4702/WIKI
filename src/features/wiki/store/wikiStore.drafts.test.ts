import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  getPage,
  listChildren,
  listDescendants,
  listPagesByIds,
  listRecentlyUpdated,
  lookupPagesByTitle,
  searchPageTitles,
  updatePage,
} from "./wikiStore";
import { createSeedData } from "../../../mock/seed";
import type { OrgMockState, Page, WikiData } from "./types";

/*
 * 초안 가시성(2026-10-18 사용자 결정) — 초안은 작성자(와 전역 관리자)만 본다. 서버가 강제하는 규칙을
 * 목업도 같게 따른다. 목업의 현재 사용자는 u1이다.
 */

const T = "2026-10-18T00:00:00.000Z";

function draft(id: string, createdBy: string, parentId: string | null = null): Page {
  return {
    id, spaceId: "sp1", parentId, title: `초안 ${id}`, body: "", position: 90,
    createdBy, updatedBy: createdBy, createdAt: T, updatedAt: T, version: 1,
    type: "page", status: "draft",
  } as Page;
}

function seedWith(pages: Page[], org?: OrgMockState) {
  const seed = createSeedData();
  const data: WikiData = { ...seed, pages: [...seed.pages, ...pages], ...(org ? { org } : {}) };
  localStorage.setItem("wiki.v1", JSON.stringify(data));
  __resetForTest();
}

const NON_ADMIN: OrgMockState = { self: { status: "ACTIVE", globalRoles: [] } };

beforeEach(() => localStorage.clear());

describe("초안 가시성(목업)", () => {
  it("남의 초안은 비관리자에게 어떤 읽기 경로에도 나오지 않는다", async () => {
    seedWith([draft("dOther", "u2"), draft("dChild", "u2", "pg1")], NON_ADMIN);

    expect(await getPage("dOther")).toBeNull();
    expect((await listChildren("sp1", null)).map((p) => p.id)).not.toContain("dOther");
    expect((await listDescendants("pg1")).map((p) => p.id)).not.toContain("dChild");
    expect((await listRecentlyUpdated("sp1", 50)).map((p) => p.id)).not.toContain("dOther");
    expect(await listPagesByIds("sp1", ["dOther"])).toEqual([]);
    expect(await lookupPagesByTitle("sp1", ["초안 dOther"])).toEqual([]);
    expect(await searchPageTitles("sp1", "초안")).toEqual([]);
  });

  it("숨긴 초안은 부모의 하위 수(childCount)에도 세지 않는다", async () => {
    const before = (await (async () => {
      seedWith([], NON_ADMIN);
      return listChildren("sp1", null);
    })()).find((p) => p.id === "pg1")!.childCount;
    seedWith([draft("dChild", "u2", "pg1")], NON_ADMIN);
    expect((await listChildren("sp1", null)).find((p) => p.id === "pg1")!.childCount).toBe(before);
  });

  it("내 초안은 그대로 보인다", async () => {
    seedWith([draft("dMine", "u1")], NON_ADMIN);
    expect(await getPage("dMine")).toMatchObject({ id: "dMine", status: "draft" });
    expect((await listChildren("sp1", null)).map((p) => p.id)).toContain("dMine");
  });

  it("전역 관리자는 남의 초안도 본다", async () => {
    seedWith([draft("dOther", "u2")], { self: { status: "ACTIVE", globalRoles: ["ADMIN"] } });
    expect(await getPage("dOther")).not.toBeNull();
    expect((await listChildren("sp1", null)).map((p) => p.id)).toContain("dOther");
  });
});

describe("초안 알림(목업)", () => {
  it("초안을 고쳐도 구독자에게 알림이 가지 않는다 — 제목으로 초안의 존재가 새지 않게", async () => {
    const seed = createSeedData();
    const data: WikiData = {
      ...seed,
      pages: [...seed.pages, draft("dMine", "u1")],
      watches: { ...(seed.watches ?? {}), dMine: ["u1", "u2"] },
    };
    localStorage.setItem("wiki.v1", JSON.stringify(data));
    __resetForTest();

    await updatePage("dMine", { body: "[@김철수](user:u2) 봐 주세요" });

    const rows = (JSON.parse(localStorage.getItem("wiki.v1")!) as WikiData).notifications ?? [];
    expect(rows.filter((n) => n.pageId === "dMine" && n.userId === "u2")).toEqual([]);
  });
});
