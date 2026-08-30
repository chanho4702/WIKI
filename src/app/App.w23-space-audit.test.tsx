import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, createSpace, deleteSpace, getNotificationPrefs } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("스페이스 삭제 기록 (V30)", () => {
  it("지운 스페이스가 전역 기록에 남는다", async () => {
    // 시드 스페이스를 지우면 빈 위키가 된다 — 지울 스페이스를 하나 만든다
    const victim = await createSpace({ key: "TMP", name: "임시" });
    await deleteSpace(victim.id);

    renderApp("/admin/audit");

    expect(await screen.findByRole("heading", { name: "스페이스 삭제 기록" })).toBeInTheDocument();
    expect(await screen.findByText(`${victim.name} (${victim.key})`)).toBeInTheDocument();
  });
});

describe("알림 요약 모드 (V31)", () => {
  it("'하루 한 번 모아서'를 고르면 즉시 저장된다", async () => {
    const user = userEvent.setup();
    renderApp("/settings/notifications");

    await user.click(await screen.findByRole("radio", { name: "하루 한 번 모아서" }));

    expect((await getNotificationPrefs()).emailMode).toBe("DAILY");
  });
});
