import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStarredSpaces, pruneStarredSpaces, setStarredSpaces, useStarredSpaces } from "./starredSpaces";

beforeEach(() => {
  localStorage.clear();
});

describe("starredSpaces — get/set", () => {
  it("저장된 값이 없으면 빈 배열을 반환한다", () => {
    expect(getStarredSpaces()).toEqual([]);
  });

  it("배열을 저장하면 그대로 복원된다", () => {
    setStarredSpaces(["sp1", "sp2"]);
    expect(getStarredSpaces()).toEqual(["sp1", "sp2"]);
  });

  it("빈 배열로 설정하면 키가 제거된다(기본값=키 부재)", () => {
    setStarredSpaces(["sp1"]);
    setStarredSpaces([]);
    expect(localStorage.getItem("wiki.ui.starredSpaces")).toBeNull();
    expect(getStarredSpaces()).toEqual([]);
  });

  it("손상된 JSON이면 빈 배열로 대체한다", () => {
    localStorage.setItem("wiki.ui.starredSpaces", "{not json");
    expect(getStarredSpaces()).toEqual([]);
  });

  it("배열이 아닌 값(JSON 객체 등)이면 빈 배열로 대체한다", () => {
    localStorage.setItem("wiki.ui.starredSpaces", JSON.stringify({ sp1: true }));
    expect(getStarredSpaces()).toEqual([]);
  });

  it("문자열이 아닌 원소는 걸러낸다", () => {
    localStorage.setItem("wiki.ui.starredSpaces", JSON.stringify(["sp1", 2, null, "sp2"]));
    expect(getStarredSpaces()).toEqual(["sp1", "sp2"]);
  });

  it("localStorage.getItem이 예외를 던져도 빈 배열을 반환한다", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getStarredSpaces()).toEqual([]);
    spy.mockRestore();
  });

  it("localStorage.setItem이 예외를 던져도 조용히 무시한다", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => setStarredSpaces(["sp1"])).not.toThrow();
    spy.mockRestore();
  });
});

describe("pruneStarredSpaces — T3 잔여 픽스", () => {
  it("validIds에 없는 id를 저장 배열에서 제거한다", () => {
    setStarredSpaces(["sp1", "sp2", "sp3"]);
    pruneStarredSpaces(["sp1", "sp3"]);
    expect(getStarredSpaces()).toEqual(["sp1", "sp3"]);
  });

  it("모두 validIds에 있으면 저장을 건드리지 않는다(불필요한 쓰기 방지)", () => {
    setStarredSpaces(["sp1", "sp2"]);
    const spy = vi.spyOn(Storage.prototype, "setItem");
    pruneStarredSpaces(["sp1", "sp2", "sp3"]);
    expect(spy).not.toHaveBeenCalled();
    expect(getStarredSpaces()).toEqual(["sp1", "sp2"]);
    spy.mockRestore();
  });

  it("모두 사라졌으면 빈 배열로(키 제거) 정리된다", () => {
    setStarredSpaces(["sp1", "sp2"]);
    pruneStarredSpaces([]);
    expect(localStorage.getItem("wiki.ui.starredSpaces")).toBeNull();
    expect(getStarredSpaces()).toEqual([]);
  });

  it("저장된 별표가 없으면 아무것도 하지 않는다", () => {
    pruneStarredSpaces(["sp1"]);
    expect(getStarredSpaces()).toEqual([]);
  });
});

describe("useStarredSpaces", () => {
  it("초기값은 저장된 목록을 반영한다", () => {
    setStarredSpaces(["sp1"]);
    const { result } = renderHook(() => useStarredSpaces());
    expect(result.current.starred).toEqual(["sp1"]);
  });

  it("toggle로 없는 id를 추가하면 목록에 더해지고 저장된다", () => {
    const { result } = renderHook(() => useStarredSpaces());
    act(() => result.current.toggle("sp1"));
    expect(result.current.starred).toEqual(["sp1"]);
    expect(getStarredSpaces()).toEqual(["sp1"]);
  });

  it("toggle로 있는 id를 제거하면 목록에서 빠지고 저장에도 반영된다", () => {
    setStarredSpaces(["sp1", "sp2"]);
    const { result } = renderHook(() => useStarredSpaces());
    act(() => result.current.toggle("sp1"));
    expect(result.current.starred).toEqual(["sp2"]);
    expect(getStarredSpaces()).toEqual(["sp2"]);
  });
});
