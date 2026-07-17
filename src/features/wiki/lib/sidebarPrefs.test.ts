import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  getSidebarPrefs,
  setSidebarCollapsed,
  setSidebarWidth,
  useSidebarPrefs,
} from "./sidebarPrefs";

beforeEach(() => {
  localStorage.clear();
});

describe("clampSidebarWidth", () => {
  it("범위 내 값은 그대로 반환한다", () => {
    expect(clampSidebarWidth(300)).toBe(300);
  });

  it("최솟값(200) 미만은 200으로 자른다", () => {
    expect(clampSidebarWidth(50)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(199)).toBe(SIDEBAR_MIN_WIDTH);
  });

  it("최댓값(480) 초과는 480으로 자른다", () => {
    expect(clampSidebarWidth(999)).toBe(SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth(481)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it("경계값(200, 480)은 그대로 반환한다", () => {
    expect(clampSidebarWidth(200)).toBe(200);
    expect(clampSidebarWidth(480)).toBe(480);
  });

  it("숫자가 아니거나(NaN) 유한하지 않으면 기본값(288)을 반환한다", () => {
    expect(clampSidebarWidth(NaN)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(clampSidebarWidth(Infinity)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(clampSidebarWidth(-Infinity)).toBe(SIDEBAR_DEFAULT_WIDTH);
  });
});

describe("getSidebarPrefs / setSidebarCollapsed / setSidebarWidth", () => {
  it("저장된 값이 없으면 기본값(펼침, 288px)을 반환한다", () => {
    expect(getSidebarPrefs()).toEqual({ collapsed: false, width: SIDEBAR_DEFAULT_WIDTH });
  });

  it("collapsed를 true로 설정하면 저장되고 다시 읽으면 true다", () => {
    setSidebarCollapsed(true);
    expect(localStorage.getItem("wiki.ui.sidebar.collapsed")).toBe("1");
    expect(getSidebarPrefs().collapsed).toBe(true);
  });

  it("collapsed를 false로 설정하면 키가 제거된다(기본값=키 부재)", () => {
    setSidebarCollapsed(true);
    setSidebarCollapsed(false);
    expect(localStorage.getItem("wiki.ui.sidebar.collapsed")).toBeNull();
    expect(getSidebarPrefs().collapsed).toBe(false);
  });

  it("width를 설정하면 clamp된 값이 저장되고 다시 읽으면 반영된다", () => {
    setSidebarWidth(999);
    expect(localStorage.getItem("wiki.ui.sidebar.width")).toBe(String(SIDEBAR_MAX_WIDTH));
    expect(getSidebarPrefs().width).toBe(SIDEBAR_MAX_WIDTH);

    setSidebarWidth(320);
    expect(getSidebarPrefs().width).toBe(320);
  });

  it("localStorage에 손상된 width 값이 있어도(숫자 아님) 기본값으로 대체한다", () => {
    localStorage.setItem("wiki.ui.sidebar.width", "not-a-number");
    expect(getSidebarPrefs().width).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it("localStorage.getItem이 예외를 던져도 기본값을 반환한다", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getSidebarPrefs()).toEqual({ collapsed: false, width: SIDEBAR_DEFAULT_WIDTH });
    spy.mockRestore();
  });

  it("localStorage.setItem이 예외를 던져도 조용히 무시한다", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => setSidebarCollapsed(true)).not.toThrow();
    expect(() => setSidebarWidth(300)).not.toThrow();
    spy.mockRestore();
  });
});

describe("useSidebarPrefs", () => {
  it("초기값은 저장된 값을 반영한다", () => {
    setSidebarCollapsed(true);
    setSidebarWidth(320);
    const { result } = renderHook(() => useSidebarPrefs());
    expect(result.current.collapsed).toBe(true);
    expect(result.current.width).toBe(320);
  });

  it("setCollapsed를 호출하면 상태와 localStorage가 함께 갱신된다", () => {
    const { result } = renderHook(() => useSidebarPrefs());
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
    expect(getSidebarPrefs().collapsed).toBe(true);
    act(() => result.current.setCollapsed(false));
    expect(result.current.collapsed).toBe(false);
    expect(getSidebarPrefs().collapsed).toBe(false);
  });

  it("setWidth를 호출하면 clamp 후 상태와 localStorage가 함께 갱신된다", () => {
    const { result } = renderHook(() => useSidebarPrefs());
    act(() => result.current.setWidth(999));
    expect(result.current.width).toBe(SIDEBAR_MAX_WIDTH);
    expect(getSidebarPrefs().width).toBe(SIDEBAR_MAX_WIDTH);
  });
});
