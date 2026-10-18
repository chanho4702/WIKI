import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import * as store from "../features/wiki/store/wikiStore";

/*
 * W-18 — 조직 디렉터리 장애(503)를 빈 목록으로 삼켜, 제한 다이얼로그가 "팀 없음"으로 보이던 결함.
 * 선택 UI는 원인을 보여 주고 저장을 막아야 한다(잘못된 주체로 제한을 전량 교체하지 않게).
 */

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
});
afterEach(() => vi.restoreAllMocks());

describe("W-18 디렉터리 장애 전파", () => {
  it("팀 목록을 못 읽으면 제한 다이얼로그가 원인을 보여 주고 저장하지 않는다", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "listTeams").mockRejectedValue(new Error("조직 서비스를 사용할 수 없습니다"));
    const save = vi.spyOn(store, "setPageRestrictions");

    renderApp("/spaces/sp1/pages/pg1");
    await user.click(await screen.findByRole("button", { name: "페이지 제한" }));
    const dialog = await screen.findByRole("dialog", { name: "페이지 제한" });

    const banner = await within(dialog).findByRole("alert");
    expect(banner).toHaveTextContent("조직 디렉터리에 연결할 수 없습니다");
    expect(banner).toHaveTextContent("조직 서비스를 사용할 수 없습니다");

    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    expect(await screen.findByText("조직 디렉터리에 연결된 뒤 저장할 수 있습니다")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("디렉터리가 정상이면 배너 없이 사용자·팀을 고를 수 있다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await user.click(await screen.findByRole("button", { name: "페이지 제한" }));
    const dialog = await screen.findByRole("dialog", { name: "페이지 제한" });

    const picker = await within(dialog).findByRole("combobox", { name: "보기 제한 주체 추가" });
    expect(within(picker).getByRole("group", { name: "팀" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });
});
