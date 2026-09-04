import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createPage,
  getPage,
  getSpaceWatchState,
  publishPage,
  setPageOwner,
  setSpaceWatchState,
  setWatchState,
  unverifyPage,
  updatePage,
  verifyPage,
} from "./wikiStore";
import type { WikiData } from "./types";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** 목업 저장소의 원본 — 다른 사용자(수신자) 몫까지 보려면 저장 데이터를 직접 읽는다. */
function raw(): WikiData {
  return JSON.parse(localStorage.getItem("wiki.v1")!) as WikiData;
}

function notificationsFor(userId: string) {
  return (raw().notifications ?? []).filter((n) => n.userId === userId);
}

/** 현재 사용자(u1)가 아닌 사람을 스페이스 구독자로 넣는다 — u1은 행위자라 알림에서 빠진다. */
async function subscribeOther(userId: string, spaceId = "sp1") {
  await setSpaceWatchState(spaceId, true); // 저장 구조를 만들고
  const data = raw();
  data.spaceWatches![spaceId] = [userId];
  localStorage.setItem("wiki.v1", JSON.stringify(data));
  __resetForTest();
}

describe("스페이스 구독 (W27-4)", () => {
  it("자동 구독은 없다 — 켜기 전에는 꺼져 있다", async () => {
    expect(await getSpaceWatchState("sp1")).toBe(false);
  });

  it("켜고 끌 수 있고 저장소에 남는다", async () => {
    expect(await setSpaceWatchState("sp1", true)).toBe(true);
    expect(await getSpaceWatchState("sp1")).toBe(true);
    expect(raw().spaceWatches!.sp1).toEqual(["u1"]);

    expect(await setSpaceWatchState("sp1", false)).toBe(false);
    expect(await getSpaceWatchState("sp1")).toBe(false);
    expect(raw().spaceWatches!.sp1).toEqual([]);
  });

  it("없는 스페이스는 한국어 오류로 거부한다", async () => {
    await expect(setSpaceWatchState("없음", true)).rejects.toThrow("스페이스를 찾을 수 없습니다");
  });

  it("스페이스 구독자는 그 안의 문서 수정 알림을 받는다", async () => {
    await subscribeOther("u4"); // u4는 pg2의 작성자·편집자가 아니라 페이지 구독자가 아니다
    await updatePage("pg2", { body: "고침" });

    expect(notificationsFor("u4")).toEqual([
      expect.objectContaining({ type: "page_updated", pageId: "pg2" }),
    ]);
  });

  it("페이지와 스페이스를 모두 구독해도 알림은 한 건이다", async () => {
    await subscribeOther("u4");
    const data = raw();
    data.watches!.pg2 = [...(data.watches!.pg2 ?? []), "u4"];
    localStorage.setItem("wiki.v1", JSON.stringify(data));
    __resetForTest();

    await updatePage("pg2", { body: "고침" });

    expect(notificationsFor("u4")).toHaveLength(1);
  });

  it("새 문서를 만들면 스페이스 구독자에게 게시 알림이 간다", async () => {
    await subscribeOther("u4");
    await createPage({ spaceId: "sp1", parentId: null, title: "새 문서", body: "내용" });

    expect(notificationsFor("u4")).toEqual([
      expect.objectContaining({ type: "page_published" }),
    ]);
    expect(notificationsFor("u1")).toHaveLength(0); // 게시한 본인은 받지 않는다
  });

  it("초안은 게시할 때 알린다", async () => {
    await subscribeOther("u4");
    const draft = await createPage({
      spaceId: "sp1",
      parentId: null,
      title: "초안",
      body: "쓰는 중",
      status: "draft",
    });
    expect(notificationsFor("u4")).toHaveLength(0);

    await publishPage(draft.id);

    expect(notificationsFor("u4")).toEqual([
      expect.objectContaining({ type: "page_published", pageId: draft.id }),
    ]);
  });

  it("폴더는 읽을 내용이 없어 게시 알림을 내지 않는다", async () => {
    await subscribeOther("u4");
    await createPage({ spaceId: "sp1", parentId: null, title: "묶음", body: "", type: "folder" });

    expect(notificationsFor("u4")).toHaveLength(0);
  });

  it("페이지 구독만 있는 사람에게는 다른 문서의 게시 알림이 가지 않는다", async () => {
    await setWatchState("pg2", true); // u1의 페이지 구독
    await subscribeOther("u4");

    await createPage({ spaceId: "sp1", parentId: null, title: "새 문서", body: "내용" });

    // u4(스페이스 구독)만 받는다 — 새 문서에는 아직 페이지 구독자가 작성자뿐이다
    expect(notificationsFor("u4")).toHaveLength(1);
    expect(notificationsFor("u2")).toHaveLength(0);
  });
});

describe("소유자·검증 (W27-5)", () => {
  it("새 문서에는 소유자도 검증도 없다", async () => {
    const page = await getPage("pg2");
    expect(page!.ownerId ?? null).toBeNull();
    expect(page!.verifiedUntil ?? null).toBeNull();
  });

  it("소유자를 지정하고 해제해도 버전은 오르지 않는다", async () => {
    const before = await getPage("pg2");
    const owned = await setPageOwner("pg2", "u3");
    expect(owned.ownerId).toBe("u3");
    expect(owned.version).toBe(before!.version); // 메타데이터 변경(아이콘·이동과 같은 취급)

    const cleared = await setPageOwner("pg2", null);
    expect(cleared.ownerId).toBeNull();
  });

  it("검증하면 시각·주체·유효기간이 찍히고 해제하면 전부 비워진다", async () => {
    const verified = await verifyPage("pg2", "2030-01-01");
    expect(verified.verifiedUntil).toBe("2030-01-01");
    expect(verified.verifiedBy).toBe("u1");
    expect(verified.verifiedAt).toBeTruthy();

    const cleared = await unverifyPage("pg2");
    expect(cleared.verifiedUntil).toBeNull();
    expect(cleared.verifiedBy).toBeNull();
    expect(cleared.verifiedAt).toBeNull();
  });

  it("유효기간을 주지 않으면 기본 90일이 붙는다", async () => {
    const verified = await verifyPage("pg2");
    const { defaultVerifiedUntil } = await import("../lib/verification");
    expect(verified.verifiedUntil).toBe(defaultVerifiedUntil());
  });

  it("이미 지난 유효기간도 그대로 저장한다 — 만료 판정은 화면 몫이다", async () => {
    const verified = await verifyPage("pg2", "2020-01-01");
    expect(verified.verifiedUntil).toBe("2020-01-01");
  });

  it("사본은 소유자·검증을 물려받지 않는다", async () => {
    await setPageOwner("pg2", "u3");
    await verifyPage("pg2", "2030-01-01");
    const { copyPage } = await import("./wikiStore");

    const copy = await copyPage("pg2");

    expect(copy.ownerId).toBeNull();
    expect(copy.verifiedUntil).toBeNull();
  });

  it("없는 페이지는 한국어 오류로 거부한다", async () => {
    await expect(verifyPage("없음")).rejects.toThrow("페이지를 찾을 수 없습니다");
    await expect(setPageOwner("없음", "u2")).rejects.toThrow("페이지를 찾을 수 없습니다");
    await expect(unverifyPage("없음")).rejects.toThrow("페이지를 찾을 수 없습니다");
  });
});
