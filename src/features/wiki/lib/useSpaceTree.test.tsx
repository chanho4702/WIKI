import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PageNode } from "../store/types";
import { listAncestors, listChildren } from "../store/wikiStore";
import { useSpaceTree } from "./useSpaceTree";

vi.mock("../store/wikiStore", () => ({
  listAncestors: vi.fn(),
  listChildren: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function node(id: string, parentId: string | null = null): PageNode {
  return { id, parentId, title: id, type: "page", status: "published", position: 1, childCount: 1 };
}

beforeEach(() => {
  vi.mocked(listChildren).mockReset().mockResolvedValue([]);
  vi.mocked(listAncestors).mockReset().mockResolvedValue([]);
});

describe("스페이스 지연 트리 요청", () => {
  it("깊은 링크의 모든 조상 가지를 앞 단계 응답 전에 요청한다", async () => {
    const first = deferred<PageNode[]>();
    const second = deferred<PageNode[]>();
    const third = deferred<PageNode[]>();
    vi.mocked(listChildren).mockImplementation(async (_spaceId, parentId) => {
      if (parentId === "a") return first.promise;
      if (parentId === "b") return second.promise;
      if (parentId === "c") return third.promise;
      return [node("a")];
    });
    vi.mocked(listAncestors).mockResolvedValue([node("a"), node("b", "a"), node("c", "b")]);
    const { result } = renderHook(() => useSpaceTree("sp1"));
    let revealing!: Promise<void>;

    await act(async () => {
      revealing = result.current.reveal("target");
    });

    expect(listChildren).toHaveBeenCalledWith("sp1", "a");
    expect(listChildren).toHaveBeenCalledWith("sp1", "b");
    expect(listChildren).toHaveBeenCalledWith("sp1", "c");
    await act(async () => {
      third.resolve([node("target", "c")]);
      second.resolve([node("c", "b")]);
      first.resolve([node("b", "a")]);
      await revealing;
    });
    expect(result.current.nodes.map((item) => item.id).sort()).toEqual(["a", "b", "c", "target"]);
    expect(result.current.expanded).toEqual(new Set(["a", "b", "c"]));
  });

  it("StrictMode에서 반복 토글과 reveal이 겹쳐도 같은 부모의 진행 요청을 공유한다", async () => {
    const children = deferred<PageNode[]>();
    vi.mocked(listChildren).mockImplementation(async (_spaceId, parentId) =>
      parentId === "a" ? children.promise : [node("a")],
    );
    vi.mocked(listAncestors).mockResolvedValue([node("a")]);
    const { result } = renderHook(() => useSpaceTree("sp1"), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let revealing!: Promise<void>;

    await act(async () => {
      result.current.toggle("a");
      result.current.toggle("a");
      result.current.toggle("a");
      revealing = result.current.reveal("child");
    });

    expect(vi.mocked(listChildren).mock.calls.filter(([, parentId]) => parentId === "a")).toHaveLength(1);
    expect(result.current.expanded.has("a")).toBe(true);
    await act(async () => {
      children.resolve([node("child", "a")]);
      await revealing;
    });
    act(() => {
      result.current.toggle("a");
      result.current.toggle("a");
    });
    expect(vi.mocked(listChildren).mock.calls.filter(([, parentId]) => parentId === "a")).toHaveLength(1);
    expect(result.current.nodes.map((item) => item.id)).toEqual(["a", "child"]);
  });

  it("최초 루트가 늦게 도착해도 먼저 받은 자손과 펼침 상태를 보존한다", async () => {
    const roots = deferred<PageNode[]>();
    vi.mocked(listChildren).mockImplementation(async (_spaceId, parentId) =>
      parentId === null ? roots.promise : [node("child", "a")],
    );
    vi.mocked(listAncestors).mockResolvedValue([node("a")]);
    const { result } = renderHook(() => useSpaceTree("sp1"));

    await act(async () => result.current.reveal("child"));
    expect(result.current.nodes).toEqual([node("child", "a")]);
    expect(result.current.loading).toBe(true);
    await act(async () => roots.resolve([node("a")]));

    expect(result.current.nodes.map((item) => item.id).sort()).toEqual(["a", "child"]);
    expect(result.current.expanded.has("a")).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("스페이스를 옮긴 뒤 도착한 자식 응답과 reveal의 펼침 결과를 무시한다", async () => {
    const children = deferred<PageNode[]>();
    vi.mocked(listChildren).mockImplementation(async (spaceId, parentId) => {
      if (parentId === "a") return children.promise;
      return [node(spaceId === "sp1" ? "a" : "other")];
    });
    vi.mocked(listAncestors).mockResolvedValue([node("a")]);
    const { result, rerender } = renderHook(({ spaceId }) => useSpaceTree(spaceId), {
      initialProps: { spaceId: "sp1" },
    });
    let revealing!: Promise<void>;
    await act(async () => {
      revealing = result.current.reveal("child");
    });

    rerender({ spaceId: "sp2" });
    await waitFor(() => expect(result.current.nodes).toEqual([node("other")]));
    await act(async () => {
      children.resolve([node("child", "a")]);
      await revealing;
    });

    expect(result.current.nodes).toEqual([node("other")]);
    expect(result.current.expanded.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it("같은 스페이스로 돌아와도 이전 진입의 조상 응답으로 조회를 이어가지 않는다", async () => {
    const ancestors = deferred<PageNode[]>();
    vi.mocked(listAncestors).mockReturnValue(ancestors.promise);
    const { result, rerender } = renderHook(({ spaceId }) => useSpaceTree(spaceId), {
      initialProps: { spaceId: "sp1" },
    });
    let revealing!: Promise<void>;
    await act(async () => {
      revealing = result.current.reveal("child");
    });
    rerender({ spaceId: "sp2" });
    rerender({ spaceId: "sp1" });

    await act(async () => {
      ancestors.resolve([node("a")]);
      await revealing;
    });

    expect(vi.mocked(listChildren).mock.calls).toEqual([["sp1", null], ["sp2", null], ["sp1", null]]);
    expect(result.current.expanded.size).toBe(0);
  });

  it("refresh는 받은 가지와 진행 중인 가지만 갱신하고 늦은 이전 응답을 버린다", async () => {
    const oldChildren = deferred<PageNode[]>();
    const newChildren = deferred<PageNode[]>();
    vi.mocked(listChildren)
      .mockResolvedValueOnce([node("a")])
      .mockReturnValueOnce(oldChildren.promise)
      .mockResolvedValueOnce([node("a"), node("new-root")])
      .mockReturnValueOnce(newChildren.promise);
    const { result } = renderHook(() => useSpaceTree("sp1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.toggle("a"));
    let refreshing!: Promise<void>;

    await act(async () => {
      refreshing = result.current.refresh();
    });
    expect(vi.mocked(listChildren).mock.calls).toEqual([["sp1", null], ["sp1", "a"], ["sp1", null], ["sp1", "a"]]);
    await act(async () => {
      newChildren.resolve([node("new-child", "a")]);
      await refreshing;
    });
    await act(async () => oldChildren.resolve([node("old-child", "a")]));

    expect(result.current.nodes.map((item) => item.id).sort()).toEqual(["a", "new-child", "new-root"]);
    expect(result.current.expanded.has("a")).toBe(true);
  });

  it("최초 루트 조회 중 변경되어도 refresh로 최신 루트를 표시한다", async () => {
    const oldRoots = deferred<PageNode[]>();
    const newRoots = deferred<PageNode[]>();
    vi.mocked(listChildren).mockReturnValueOnce(oldRoots.promise).mockReturnValueOnce(newRoots.promise);
    const { result } = renderHook(() => useSpaceTree("sp1"));
    let refreshing!: Promise<void>;
    await act(async () => {
      refreshing = result.current.refresh();
    });
    await act(async () => oldRoots.resolve([node("old-root")]));
    expect(result.current.loading).toBe(true);
    expect(result.current.nodes).toEqual([]);
    await act(async () => {
      newRoots.resolve([node("new-root")]);
      await refreshing;
    });

    expect(result.current.nodes).toEqual([node("new-root")]);
    expect(result.current.loading).toBe(false);
  });

  it("자식 조회 실패를 캐시하지 않아 다시 펼치면 재시도한다", async () => {
    vi.mocked(listChildren)
      .mockResolvedValueOnce([node("a")])
      .mockRejectedValueOnce(new Error("일시적인 조회 실패"))
      .mockResolvedValueOnce([node("child", "a")]);
    const { result } = renderHook(() => useSpaceTree("sp1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.toggle("a"));
    expect(result.current.error).toBeNull();

    await act(async () => {
      result.current.toggle("a");
      result.current.toggle("a");
    });

    expect(vi.mocked(listChildren).mock.calls.filter(([, parentId]) => parentId === "a")).toHaveLength(2);
    expect(result.current.nodes.map((item) => item.id)).toEqual(["a", "child"]);
  });

  it("이전 스페이스의 루트 실패가 현재 스페이스의 오류로 남지 않는다", async () => {
    const oldRoots = deferred<PageNode[]>();
    vi.mocked(listChildren).mockReturnValueOnce(oldRoots.promise).mockResolvedValue([node("other")]);
    const { result, rerender } = renderHook(({ spaceId }) => useSpaceTree(spaceId), {
      initialProps: { spaceId: "sp1" as string | null },
    });
    rerender({ spaceId: "sp2" });
    await act(async () => oldRoots.reject(new Error("이전 스페이스 조회 실패")));

    expect(result.current.nodes).toEqual([node("other")]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    rerender({ spaceId: null });
    expect(result.current.nodes).toEqual([]);
    expect(result.current.expanded.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });
});
