import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { getPageWidth, setPageWidth, usePageWidth } from "./pageWidth";

beforeEach(() => {
  localStorage.clear();
});

describe("pageWidth — get/set", () => {
  it("저장된 값이 없으면 기본값(default)을 반환한다", () => {
    expect(getPageWidth("pg1")).toBe("default");
  });

  it("full로 설정하면 해당 pageId 키에 저장되고 다시 읽으면 full이다", () => {
    setPageWidth("pg1", "full");
    expect(localStorage.getItem("wiki.ui.width.pg1")).toBe("full");
    expect(getPageWidth("pg1")).toBe("full");
  });

  it("default로 설정하면 키가 제거된다(기본값=키 부재)", () => {
    setPageWidth("pg1", "full");
    setPageWidth("pg1", "default");
    expect(localStorage.getItem("wiki.ui.width.pg1")).toBeNull();
    expect(getPageWidth("pg1")).toBe("default");
  });

  it("pageId별로 독립적으로 저장된다", () => {
    setPageWidth("pg1", "full");
    expect(getPageWidth("pg2")).toBe("default");
  });

  it("localStorage.getItem이 예외를 던져도 기본값을 반환한다", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getPageWidth("pg1")).toBe("default");
    spy.mockRestore();
  });

  it("localStorage.setItem이 예외를 던져도 조용히 무시한다", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => setPageWidth("pg1", "full")).not.toThrow();
    spy.mockRestore();
  });
});

describe("usePageWidth", () => {
  it("초기값은 저장된 값을 반영한다", () => {
    setPageWidth("pg1", "full");
    const { result } = renderHook(() => usePageWidth("pg1"));
    expect(result.current.width).toBe("full");
  });

  it("pageId가 없으면 항상 default이고 toggle은 아무 동작도 하지 않는다", () => {
    const { result } = renderHook(() => usePageWidth(undefined));
    expect(result.current.width).toBe("default");
    act(() => result.current.toggle());
    expect(result.current.width).toBe("default");
  });

  it("toggle을 호출하면 default↔full을 오가고 localStorage에도 반영된다", () => {
    const { result } = renderHook(() => usePageWidth("pg1"));
    expect(result.current.width).toBe("default");
    act(() => result.current.toggle());
    expect(result.current.width).toBe("full");
    expect(getPageWidth("pg1")).toBe("full");
    act(() => result.current.toggle());
    expect(result.current.width).toBe("default");
    expect(getPageWidth("pg1")).toBe("default");
  });

  it("pageId가 바뀌면(라우트 이동) 새 pageId 기준으로 다시 읽는다", () => {
    setPageWidth("pg2", "full");
    const { result, rerender } = renderHook(({ pageId }) => usePageWidth(pageId), {
      initialProps: { pageId: "pg1" },
    });
    expect(result.current.width).toBe("default");
    rerender({ pageId: "pg2" });
    expect(result.current.width).toBe("full");
  });
});
