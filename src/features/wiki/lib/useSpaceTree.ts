import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageNode } from "../store/types";
import { listAncestors, listChildren } from "../store/wikiStore";

/**
 * 지연 로딩 페이지 트리(2026-08-29).
 *
 * 예전에는 스페이스에 들어가는 순간 그 스페이스의 **전 페이지**를 받아 사이드바를 그렸다.
 * 문서가 수만 건이 되면 사이드바 한 번 여는 데 전량이 실린다.
 *
 * 지금은 최상위만 먼저 받고, 펼칠 때 그 아래 한 단계를 받는다. 화살표는 서버가 준
 * `childCount`로 그린다 — 자식을 받아보지 않고도 "펼칠 게 있는지"를 알아야 하기 때문이다.
 *
 * 깊은 링크로 들어오면(`/pages/손자`) 조상 체인을 받아 그 자리까지만 펼친다.
 */
export interface SpaceTree {
  /** 지금까지 로드한 노드(평면). 트리 모양은 parentId로 만든다. */
  nodes: PageNode[];
  /** 펼쳐진 노드 id. 루트는 항상 보이므로 여기 없다. */
  expanded: Set<string>;
  /** 최초 루트 로딩 중 */
  loading: boolean;
  error: string | null;
  toggle: (id: string) => void;
  /** 그 페이지가 트리에 보이도록 조상 체인을 펼친다(깊은 링크 진입). */
  reveal: (pageId: string) => Promise<void>;
  /** 생성·이동·삭제 후 — 이미 펼쳐 둔 자리만 다시 읽는다(전량 재조회가 아니다). */
  refresh: () => Promise<void>;
}

/** 루트를 나타내는 키 — Map은 null 키를 쓸 수 있지만 직렬화·비교가 헷갈려 문자열로 고정한다. */
const ROOT = "";

interface TreeGeneration {
  spaceId: string | null;
  loadedParents: Set<string>;
  pendingChildren: Map<string, Promise<void>>;
  expanded: Set<string>;
}

export function useSpaceTree(spaceId: string | null): SpaceTree {
  const [nodesById, setNodesById] = useState<Map<string, PageNode>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 요청·캐시는 스페이스 진입마다 분리한다. 같은 스페이스로 돌아와도 이전 응답을 섞지 않는다.
  const generation = useRef<TreeGeneration | null>(null);

  const mergeNodes = useCallback((scope: TreeGeneration, parentKey: string, children: PageNode[]) => {
    scope.loadedParents.add(parentKey);
    setNodesById((prev) => {
      if (generation.current !== scope) return prev;
      const next = new Map(prev);
      // 이 부모 아래에서 사라진 노드는 걷어낸다 — 다른 곳에서 지워졌을 수 있다.
      for (const [id, node] of prev) {
        if ((node.parentId ?? ROOT) === parentKey) next.delete(id);
      }
      for (const child of children) next.set(child.id, child);
      return next;
    });
  }, []);

  const loadChildren = useCallback(
    (scope: TreeGeneration, parentId: string | null, force = false): Promise<void> => {
      if (!scope.spaceId || generation.current !== scope) return Promise.resolve();
      const key = parentId ?? ROOT;
      if (!force) {
        const pending = scope.pendingChildren.get(key);
        if (pending) return pending;
        if (scope.loadedParents.has(key)) return Promise.resolve();
      }
      const request: Promise<void> = listChildren(scope.spaceId, parentId)
        .then((children) => {
          // 변경 후 refresh가 먼저 끝났다면 변경 전 응답으로 되돌리지 않는다.
          if (generation.current !== scope || scope.pendingChildren.get(key) !== request) return;
          mergeNodes(scope, key, children);
          if (key === ROOT) setError(null);
        })
        .catch((e: unknown) => {
          if (
            generation.current === scope &&
            scope.pendingChildren.get(key) === request &&
            key === ROOT &&
            !scope.loadedParents.has(ROOT)
          ) {
            setError(e instanceof Error ? e.message : String(e));
          }
          throw e;
        })
        .finally(() => {
          if (scope.pendingChildren.get(key) !== request) return;
          scope.pendingChildren.delete(key);
          if (generation.current === scope && key === ROOT) setLoading(false);
        });
      scope.pendingChildren.set(key, request);
      return request;
    },
    [mergeNodes],
  );

  // 스페이스가 바뀌면 처음부터 — 이전 스페이스의 노드가 남으면 남의 트리가 섞인다.
  useEffect(() => {
    const scope: TreeGeneration = {
      spaceId,
      loadedParents: new Set(),
      pendingChildren: new Map(),
      expanded: new Set(),
    };
    generation.current = scope;
    setNodesById(new Map());
    setExpanded(scope.expanded);
    setLoading(Boolean(spaceId));
    setError(null);
    if (spaceId) void loadChildren(scope, null).catch(() => undefined);
    return () => {
      if (generation.current === scope) generation.current = null;
    };
  }, [spaceId, loadChildren]);

  const toggle = useCallback(
    (id: string) => {
      const scope = generation.current;
      if (!spaceId || scope?.spaceId !== spaceId) return;
      const next = new Set(scope.expanded);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // StrictMode가 state updater를 재실행해도 요청은 한 번만 시작한다.
        // 접었다 펼치거나 reveal과 겹치면 캐시·진행 요청을 함께 재사용한다.
        void loadChildren(scope, id).catch(() => undefined);
      }
      scope.expanded = next;
      setExpanded(next);
    },
    [spaceId, loadChildren],
  );

  const reveal = useCallback(
    async (pageId: string) => {
      const scope = generation.current;
      if (!spaceId || scope?.spaceId !== spaceId) return;
      const chain = await listAncestors(pageId).catch(() => [] as PageNode[]);
      if (generation.current !== scope || chain.length === 0) return;
      // 조상 id는 이미 모두 안다. 각 단계 응답을 기다리지 않고 필요한 가지를 함께 읽는다.
      await Promise.all(chain.map((ancestor) => loadChildren(scope, ancestor.id)));
      if (generation.current !== scope) return;
      const next = new Set(scope.expanded);
      for (const ancestor of chain) next.add(ancestor.id);
      scope.expanded = next;
      setExpanded(next);
    },
    [spaceId, loadChildren],
  );

  const refresh = useCallback(async () => {
    const scope = generation.current;
    if (!spaceId || scope?.spaceId !== spaceId) return;
    const parents = new Set([...scope.loadedParents, ...scope.pendingChildren.keys()]);
    // 변경 직전 진행 중이던 조회도 갱신한다. 열지도 않은 가지는 요청하지 않는다.
    await Promise.all(
      [...parents].map((key) =>
        loadChildren(scope, key === ROOT ? null : key, true).catch(() => undefined),
      ),
    );
  }, [spaceId, loadChildren]);

  const nodes = useMemo(() => [...nodesById.values()], [nodesById]);

  return { nodes, expanded, loading, error, toggle, reveal, refresh };
}
