import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, getNotificationPrefs, listNotifications } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";
import type { Notification, NotificationType, WikiData } from "../features/wiki/store/types";

/*
 * F-05 — 알림이 벨 30건뿐이었다. 전체 화면에서 이전 알림을 계속 읽고 종류로 거르며,
 * "새 문서 게시" 이메일 수신을 "문서 수정"과 따로 끈다.
 */

function seedNotifications(count: number, typeOf: (i: number) => NotificationType) {
  const seed = createSeedData();
  const base = Date.parse("2026-10-01T00:00:00.000Z");
  const notifications: Notification[] = Array.from({ length: count }, (_, i) => ({
    id: `n${String(i).padStart(3, "0")}`,
    userId: "u1",
    type: typeOf(i),
    pageId: "pg1",
    spaceId: "sp1",
    pageTitle: `알림 문서 ${i}`,
    actorId: "u2",
    createdAt: new Date(base + i * 60_000).toISOString(),
    read: i % 2 === 0,
  }));
  const data: WikiData = { ...seed, notifications };
  localStorage.setItem("wiki.v1", JSON.stringify(data));
  __resetForTest();
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("F-05 알림 목록 계약(목업)", () => {
  it("커서로 이전 쪽을 이어 읽고, 마지막 쪽은 nextBefore가 null이다", async () => {
    seedNotifications(100, () => "page_updated");
    const first = await listNotifications({ limit: 40 });
    expect(first.items).toHaveLength(40);
    expect(first.items[0].pageTitle).toBe("알림 문서 99");
    const second = await listNotifications({ limit: 40, before: first.nextBefore! });
    const third = await listNotifications({ limit: 40, before: second.nextBefore! });
    expect(third.items).toHaveLength(20);
    expect(third.nextBefore).toBeNull();
    const all = [...first.items, ...second.items, ...third.items].map((n) => n.id);
    expect(new Set(all).size).toBe(100);
  });

  it("종류로 거르고, 안 읽은 수는 필터와 무관하다", async () => {
    seedNotifications(10, (i) => (i < 3 ? "mentioned" : "comment"));
    const mentions = await listNotifications({ types: ["mentioned"] });
    expect(mentions.items.map((n) => n.type)).toEqual(["mentioned", "mentioned", "mentioned"]);
    expect(mentions.unreadCount).toBe(5);
  });

  it("아무 옵션 없이 부르면 예전처럼 최근 30건(벨)", async () => {
    seedNotifications(45, () => "comment");
    expect((await listNotifications()).items).toHaveLength(30);
  });
});

describe("F-05 전체 알림 화면", () => {
  it("벨의 '모두 보기'로 들어가 '이전 알림 더 보기'로 100건을 끝까지 읽는다", async () => {
    const user = userEvent.setup();
    seedNotifications(100, () => "page_updated");
    renderApp("/spaces/sp1");

    await user.click(await screen.findByRole("button", { name: /^알림/ }));
    await user.click(await screen.findByRole("link", { name: "모두 보기" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/notifications"));

    const list = await screen.findByRole("list", { name: "알림 목록" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(50);
    await user.click(screen.getByRole("button", { name: "이전 알림 더 보기" }));
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(100));
    expect(screen.queryByRole("button", { name: "이전 알림 더 보기" })).not.toBeInTheDocument();
  });

  it("종류 필터에서 '멘션'을 고르면 멘션 알림만 나오고 URL에 남는다", async () => {
    const user = userEvent.setup();
    seedNotifications(10, (i) => (i < 3 ? "mentioned" : "comment"));
    renderApp("/notifications");
    const list = await screen.findByRole("list", { name: "알림 목록" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);

    await user.click(screen.getByLabelText("종류"));
    await user.click(await screen.findByRole("option", { name: "멘션" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("type=mentioned"));
    await waitFor(() => {
      const items = within(screen.getByRole("list", { name: "알림 목록" })).getAllByRole("listitem");
      expect(items).toHaveLength(3);
      for (const item of items) expect(item).toHaveTextContent("멘션했습니다");
    });
  });
});

describe("F-05 새 문서 알림 수신 설정 분리", () => {
  it("'새 문서'만 끄면 문서 수정 알림은 켜진 채다", async () => {
    const user = userEvent.setup();
    renderApp("/settings/notifications");
    await screen.findByRole("heading", { name: "알림 설정" });

    const published = await screen.findByRole("switch", { name: "구독한 스페이스에 새 문서가 올라왔을 때" });
    expect(published).toBeChecked(); // 저장한 적 없으면 문서 수정 설정을 따른다
    await user.click(published);

    await waitFor(async () => expect((await getNotificationPrefs()).pagePublished).toBe(false));
    expect((await getNotificationPrefs()).pageUpdated).toBe(true);
    expect(screen.getByRole("switch", { name: "구독한 문서가 바뀌었을 때" })).toBeChecked();
  });
});
