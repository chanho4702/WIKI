import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { NotificationBell } from "./NotificationBell";
import { __resetForTest, listNotifications } from "../store/wikiStore";
import { createSeedData } from "../../../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

function seedNotification() {
  const data = createSeedData();
  data.notifications = [
    {
      id: "n1", userId: "u1", type: "mentioned", pageId: "pg1", spaceId: "sp1",
      pageTitle: "시작하기", actorId: "u2", createdAt: new Date().toISOString(), read: false,
    },
  ];
  localStorage.setItem("wiki.v1", JSON.stringify(data));
}

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

describe("NotificationBell — 알림함", () => {
  it("미읽음이 있으면 배지가 뜨고, 열면 행위자 이름과 페이지 제목이 보인다", async () => {
    seedNotification();
    const user = userEvent.setup();
    renderBell();

    const trigger = await screen.findByRole("button", { name: "알림 1개 안 읽음" });
    await user.click(trigger);

    const popover = await screen.findByRole("dialog", { name: "알림함" });
    expect(popover).toHaveTextContent("시작하기");
    await waitFor(() => expect(popover).toHaveTextContent(/님이 나를 멘션했습니다/));
  });

  it("모두 읽음이 unreadCount를 0으로 만든다", async () => {
    seedNotification();
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole("button", { name: "알림 1개 안 읽음" }));
    await user.click(await screen.findByRole("button", { name: "모두 읽음" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "알림" })).toBeInTheDocument());
    expect((await listNotifications()).unreadCount).toBe(0);
  });

  it("알림이 없으면 안내 문구", async () => {
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: "알림" }));
    expect(await screen.findByText(/멘션되거나 내 페이지가 업데이트되면/)).toBeInTheDocument();
  });
});
