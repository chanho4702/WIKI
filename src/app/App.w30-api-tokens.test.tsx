import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

/*
 * PAT 설계 §6 "형제 앱 진입점" — 토큰 관리 화면은 계정 포털(myFront `/app/tokens`)에 있다.
 * 같은 오리진이지만 다른 SPA라 라우터가 아니라 window.location 전체 이동으로 나간다.
 * jsdom의 실제 assign은 "Not implemented"를 던지므로 location 자체를 스텁으로 바꾼다.
 */
const realLocationDescriptor = Object.getOwnPropertyDescriptor(window, "location")!;

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

afterEach(() => {
  Object.defineProperty(window, "location", realLocationDescriptor);
});

function stubAssign() {
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign },
  });
  return assign;
}

describe("W30 개인 API 토큰 진입점", () => {
  it("사용자 메뉴의 'API 토큰'을 고르면 계정 포털로 전체 이동한다", async () => {
    const assign = stubAssign();
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");

    await user.click(await screen.findByRole("button", { name: "사용자 메뉴" }));
    const item = await screen.findByRole("menuitem", { name: /API 토큰/ });
    expect(item).toHaveTextContent("스크립트·CI에서 쓰는 개인 토큰 관리");

    await user.click(item);
    expect(assign).toHaveBeenCalledWith("/app/tokens");
    // 전체 이동이라 SPA 경로는 그대로다
    expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg1");
  });

  it("읽기 전용 인스턴스에는 사용자 메뉴도 'API 토큰'도 없다", async () => {
    renderApp("/spaces/sp1/pages/pg1", { readOnly: true });

    expect(await screen.findByText("읽기 전용 문서")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "사용자 메뉴" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /API 토큰/ })).not.toBeInTheDocument();
  });
});
