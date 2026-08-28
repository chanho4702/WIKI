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

export function useSpaceTree(spaceId: string | null): SpaceTree {
  const [nodesById, setNodesById] = useState<Map<string, PageNode>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 자식을 이미 받아 온 부모(루트 포함). 다시 펼칠 때 재요청하지 않는다. */
  const loadedParents = useRef<Set<string>>(new Set());

  const mergeNodes = useCallback((parentKey: string, children: PageNode[]) => {
    loadedParents.current.add(parentKey);
    setNodesById((prev) => {
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
    async (parentId: string | null) => {
      if (!spaceId) return;
      const found = await listChildren(spaceId, parentId);
      mergeNodes(parentId ?? ROOT, found);
    },
    [spaceId, mergeNodes],
  );

  // 스페이스가 바뀌면 처음부터 — 이전 스페이스의 노드가 남으면 남의 트리가 섞인다.
  useEffect(() => {
    loadedParents.current = new Set();
    setNodesById(new Map());
    setExpanded(new Set());
    if (!spaceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listChildren(spaceId, null)
      .then((roots) => {
        if (cancelled) return;
        loadedParents.current.add(ROOT);
        setNodesById(new Map(roots.map((n) => [n.id, n])));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  const toggle = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          return next;
        }
        next.add(id);
        if (!loadedParents.current.has(id)) {
          // 접을 때는 받아둔 것을 버리지 않는다 — 다시 펼치면 즉시 보이는 편이 낫다.
          void loadChildren(id).catch(() => {
            // 자식을 못 받으면 펼침만 남는다(빈 노드). 트리 전체를 죽이지 않는다.
          });
        }
        return next;
      });
    },
    [loadChildren],
  );

  const reveal = useCallback(
    async (pageId: string) => {
      if (!spaceId) return;
      const chain = await listAncestors(pageId).catch(() => [] as PageNode[]);
      if (chain.length === 0) return;
      // 위에서부터 한 단계씩 — 부모의 자식을 받아야 그 다음 조상이 트리에 존재한다.
      for (const ancestor of chain) {
        if (!loadedParents.current.has(ancestor.id)) await loadChildren(ancestor.id);
      }
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const ancestor of chain) next.add(ancestor.id);
        return next;
      });
    },
    [spaceId, loadChildren],
  );

  const refresh = useCallback(async () => {
    if (!spaceId) return;
    const parents = [...loadedParents.current];
    // 펼쳐 둔 자리만 다시 읽는다 — 열지도 않은 가지를 되살릴 이유가 없다.
    await Promise.all(
      parents.map((key) =>
        listChildren(spaceId, key === ROOT ? null : key)
          .then((children) => mergeNodes(key, children))
          .catch(() => undefined),
      ),
    );
  }, [spaceId, mergeNodes]);

  const nodes = useMemo(() => [...nodesById.values()], [nodesById]);

  return { nodes, expanded, loading, error, toggle, reveal, refresh };
}
