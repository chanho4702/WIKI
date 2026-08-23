import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  addComment,
  listNotifications,
  markNotificationsRead,
  updatePage,
} from "./wikiStore";
import type { WikiData } from "./types";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** 목업 저장소의 알림 행 원본 — 다른 사용자(수신자) 몫까지 검증하려면 저장 데이터를 직접 본다. */
function rawNotifications() {
  const data = JSON.parse(localStorage.getItem("wiki.v1")!) as WikiData;
  return data.notifications ?? [];
}

describe("알림 트리거 (백엔드 V11과 같은 규칙)", () => {
  it("새 멘션은 mentioned, 관심 사용자(작성자·편집자)는 page_updated — 행위자 자신 제외", async () => {
    // pg3: createdBy u2 — 현재 사용자(u1)가 u2를 새로 멘션하며 수정
    await updatePage("pg3", { body: "[@김철수](user:u2) 검토 부탁" });
    const rows = rawNotifications();
    // u2는 새로 멘션됨 → mentioned 1건(작성자 몫 page_updated와 겹쳐 보내지 않음)
    expect(rows.filter((n) => n.userId === "u2")).toEqual([
      expect.objectContaining({ type: "mentioned", pageId: "pg3", actorId: "u1", read: false }),
    ]);
    // 행위자(u1)는 아무것도 받지 않는다
    expect(rows.filter((n) => n.userId === "u1")).toHaveLength(0);
  });

  it("연속 업데이트는 미읽음 1건으로 합쳐지고, 멘션 유지(신규 아님)는 재알림하지 않는다", async () => {
    await updatePage("pg3", { body: "[@김철수](user:u2) 1차" });
    await updatePage("pg3", { body: "[@김철수](user:u2) 2차" });
    await updatePage("pg3", { body: "[@김철수](user:u2) 3차" });
    const u2 = rawNotifications().filter((n) => n.userId === "u2");
    // 최초 멘션 1건 + 이후 업데이트 합침 1건
    expect(u2.map((n) => n.type).sort()).toEqual(["mentioned", "page_updated"]);
  });

  it("댓글은 comment로 페이지 작성자·편집자에게 간다", async () => {
    await addComment("pg3", "확인했습니다"); // pg3 작성자 u2, 행위자 u1
    const u2 = rawNotifications().filter((n) => n.userId === "u2");
    expect(u2).toEqual([expect.objectContaining({ type: "comment", pageId: "pg3" })]);
  });
});

describe("알림 조회·읽음 (현재 사용자 스코프)", () => {
  it("listNotifications는 내 알림만, 최신순 + unreadCount — 읽음 처리 후 0", async () => {
    // 현재 사용자(u1) 몫 알림을 직접 심는다 — 단일 사용자 목업에서 자기 행동으로는 안 생기므로
    const data = JSON.parse(localStorage.getItem("wiki.v1") ?? "null") as WikiData | null;
    const seeded = data ?? (await (async () => {
      await listNotifications(); // 시드 생성 유도
      return JSON.parse(localStorage.getItem("wiki.v1")!) as WikiData;
    })());
    seeded.notifications = [
      {
        id: "n1", userId: "u1", type: "mentioned", pageId: "pg1", spaceId: "sp1",
        pageTitle: "시작하기", actorId: "u2", createdAt: "2026-08-23T09:00:00.000Z", read: false,
      },
      {
        id: "n2", userId: "u2", type: "comment", pageId: "pg1", spaceId: "sp1",
        pageTitle: "시작하기", actorId: "u1", createdAt: "2026-08-23T09:01:00.000Z", read: false,
      },
    ];
    localStorage.setItem("wiki.v1", JSON.stringify(seeded));
    __resetForTest();

    const list = await listNotifications();
    expect(list.unreadCount).toBe(1);
    expect(list.items).toHaveLength(1); // u2 몫은 안 보인다
    expect(list.items[0].pageTitle).toBe("시작하기");

    await markNotificationsRead();
    const after = await listNotifications();
    expect(after.unreadCount).toBe(0);
    expect(after.items[0].read).toBe(true);
  });
});
