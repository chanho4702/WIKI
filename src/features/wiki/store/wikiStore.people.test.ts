import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, createPage, getPage, getPersonProfile, listPersonPages } from "./wikiStore";
import type { WikiData } from "./types";

/* F-07 사람 프로필 — 목업 계약(백엔드 제안 계약과 같은 규칙) */

function editData(fn: (data: WikiData) => void): void {
  const data = JSON.parse(localStorage.getItem("wiki.v1")!) as WikiData;
  fn(data);
  localStorage.setItem("wiki.v1", JSON.stringify(data));
  __resetForTest();
}

beforeEach(async () => {
  localStorage.clear();
  __resetForTest();
  await getPage("pg1"); // 시드 저장
});

describe("getPersonProfile(목업)", () => {
  it("이름·이메일·상태·소속 팀을 준다", async () => {
    expect(await getPersonProfile("u2")).toEqual({
      id: "u2", name: "이서연", email: "u2@example.com", status: "ACTIVE",
      teams: [{ id: "t1", name: "플랫폼팀" }],
    });
  });

  it("상태 override를 따르고, 없는 사람은 null", async () => {
    editData((d) => {
      d.org = { memberStatus: { u3: "SUSPENDED" } };
    });
    expect((await getPersonProfile("u3"))?.status).toBe("SUSPENDED");
    expect(await getPersonProfile("nobody")).toBeNull();
  });
});

describe("listPersonPages(목업)", () => {
  it("만들었거나 마지막으로 고친 문서를 최근 수정순으로 준다", async () => {
    const rows = await listPersonPages("u2");
    expect(rows?.map((r) => r.id)).toEqual(["pg1", "pg3", "pg5"]);
    expect(rows?.[0]).toMatchObject({ spaceId: "sp1", spaceName: "개발 위키", status: "published" });
  });

  it("보관 문서는 빼고, limit을 지킨다", async () => {
    editData((d) => {
      d.pages.find((p) => p.id === "pg3")!.archivedAt = "2026-10-01T00:00:00Z";
    });
    expect((await listPersonPages("u2"))?.map((r) => r.id)).toEqual(["pg1", "pg5"]);
    expect(await listPersonPages("u2", 1)).toHaveLength(1);
  });

  it("남의 초안은 관리자에게만 — 비관리자에게는 없다", async () => {
    const draft = await createPage({ spaceId: "sp1", title: "남의 초안", body: "", status: "draft" });
    editData((d) => {
      const p = d.pages.find((x) => x.id === draft.id)!;
      p.createdBy = "u2";
      p.updatedBy = "u2";
    });
    expect((await listPersonPages("u2"))?.map((r) => r.id)).toContain(draft.id);

    editData((d) => {
      d.org = { self: { status: "ACTIVE", globalRoles: [] } };
    });
    expect((await listPersonPages("u2"))?.map((r) => r.id)).not.toContain(draft.id);
  });

  it("내 초안은 내 프로필에 보인다(작성자)", async () => {
    editData((d) => {
      d.org = { self: { status: "ACTIVE", globalRoles: [] } };
    });
    const draft = await createPage({ spaceId: "sp1", title: "내 초안", body: "", status: "draft" });
    expect((await listPersonPages("u1"))?.map((r) => r.id)).toContain(draft.id);
  });
});
