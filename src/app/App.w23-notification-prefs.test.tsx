import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, getNotificationPrefs } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** 알림 설정(W23) — 이메일 채널 스위치. 목업은 발송 구성이 없다. */
describe("W23 알림 설정", () => {
  it("발송 구성이 없으면 배너로 먼저 말한다", async () => {
    renderApp("/settings/notifications");

    expect(await screen.findByRole("heading", { name: "알림 설정" })).toBeInTheDocument();
    expect(screen.getByText(/이메일 발송이 구성되어 있지 않습니다/)).toBeInTheDocument();
  });

  it("스위치는 누르는 즉시 저장되고 다시 열어도 남는다", async () => {
    const user = userEvent.setup();
    renderApp("/settings/notifications");
    await screen.findByRole("heading", { name: "알림 설정" });

    const mention = screen.getByRole("switch", { name: "나를 멘션했을 때" });
    expect(mention).toBeChecked();
    await user.click(mention);
    await waitFor(() => expect(mention).not.toBeChecked());

    await waitFor(async () => expect((await getNotificationPrefs()).mentioned).toBe(false));
    expect((await getNotificationPrefs()).pageUpdated).toBe(true);
  });

  it("이메일 채널을 끄면 타입 스위치가 잠긴다", async () => {
    const user = userEvent.setup();
    renderApp("/settings/notifications");
    await screen.findByRole("heading", { name: "알림 설정" });

    await user.click(screen.getByRole("switch", { name: "이메일로 알림 받기" }));

    // 전체 스위트 부하에서는 클릭 뒤 상태 반영이 한 틱 늦을 수 있다 — 결과로 기다린다
    const list = screen.getByRole("list", { name: "이메일로 받을 알림" });
    await waitFor(() => {
      for (const sw of within(list).getAllByRole("switch")) expect(sw).toBeDisabled();
    });
    await waitFor(async () => expect((await getNotificationPrefs()).emailEnabled).toBe(false));
  });

  it("알림함 하단의 링크로 설정에 온다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");

    await user.click(await screen.findByRole("button", { name: /^알림/ }));
    await user.click(await screen.findByRole("link", { name: "알림 설정" }));

    expect(await screen.findByRole("heading", { name: "알림 설정" })).toBeInTheDocument();
  });
});
