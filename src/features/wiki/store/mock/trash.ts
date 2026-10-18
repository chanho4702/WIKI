// 휴지통(W21-1)·보관(W23) 목업.
import { CURRENT_USER_ID } from "../../../../mock/users";
import type { Page, PageRestoreResult, TrashEntry, TrashItem, WikiData } from "../types";
import { clone, load, persist } from "./db";

function archivedDescendants(data: WikiData, rootId: string): Page[] {
  const out: Page[] = [];
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const p of data.pages) {
      if (p.parentId === cur && p.archivedAt && !p.archivedRoot) {
        out.push(p);
        queue.push(p.id);
      }
    }
  }
  return out;
}

export async function listArchive(spaceId: string): Promise<TrashItem[]> {
  const data = load();
  return data.pages
    .filter((p) => p.spaceId === spaceId && p.archivedAt && p.archivedRoot)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""))
    .map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      icon: p.icon ?? null,
      deletedAt: p.archivedAt as string,
      deletedBy: p.archivedBy ?? CURRENT_USER_ID,
      descendantCount: archivedDescendants(data, p.id).length,
    }));
}

export async function archivePage(id: string): Promise<Page> {
  const data = load();
  const root = data.pages.find((p) => p.id === id);
  if (!root) throw new Error("페이지를 찾을 수 없습니다");
  if (root.archivedAt) throw new Error("이미 보관된 문서입니다");
  const now = new Date().toISOString();
  const queue = [root.id];
  root.archivedAt = now;
  root.archivedBy = CURRENT_USER_ID;
  root.archivedRoot = true;
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const p of data.pages) {
      if (p.parentId === cur && !p.archivedAt) {
        p.archivedAt = now;
        p.archivedBy = CURRENT_USER_ID;
        p.archivedRoot = false;
        queue.push(p.id);
      }
    }
  }
  persist();
  return clone(root);
}

export async function unarchivePage(id: string): Promise<Page> {
  const data = load();
  const root = data.pages.find((p) => p.id === id);
  if (!root) throw new Error("페이지를 찾을 수 없습니다");
  if (!root.archivedAt) throw new Error("보관되지 않은 문서입니다");
  const parent = root.parentId ? data.pages.find((p) => p.id === root.parentId) : null;
  if (parent?.archivedAt) throw new Error("상위 문서가 보관 중입니다. 상위 문서의 보관을 먼저 해제하세요");
  for (const p of [root, ...archivedDescendants(data, root.id)]) {
    p.archivedAt = null;
    p.archivedBy = null;
    p.archivedRoot = false;
  }
  persist();
  return clone(root);
}

export async function listTrash(spaceId: string): Promise<TrashItem[]> {
  const data = load();
  const entries = (data.trash ?? []).filter((t) => t.page.spaceId === spaceId);
  const childrenOf = new Map<string | null, TrashEntry[]>();
  for (const entry of entries) {
    const key = entry.page.parentId;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), entry]);
  }
  return entries
    .filter((t) => t.root)
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    .map((t) => ({
      id: t.page.id,
      title: t.page.title,
      type: t.page.type,
      icon: t.page.icon ?? null,
      deletedAt: t.deletedAt,
      deletedBy: t.deletedBy,
      descendantCount: collectBatch(childrenOf, t.page.id).length,
    }));
}

/**
 * 루트와 "따로 버리지 않은" 하위를 되살린다. 하위를 먼저 따로 버려둔 묶음(root=true)은
 * 상위 복원에 휩쓸리지 않는다 — 사용자의 두 결정을 각각 지킨다.
 */
export async function restorePage(id: string): Promise<PageRestoreResult> {
  const data = load();
  data.trash ??= [];
  const root = data.trash.find((t) => t.page.id === id);
  if (!root) throw new Error("휴지통에서 찾을 수 없습니다");

  const childrenOf = new Map<string | null, TrashEntry[]>();
  for (const entry of data.trash.filter((t) => t.page.spaceId === root.page.spaceId)) {
    const key = entry.page.parentId;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), entry]);
  }
  const batch = [root, ...collectBatch(childrenOf, id)];

  // 원래 부모가 사라졌으면 최상위로 — 없는 부모를 그대로 두면 트리에 나타나지 않는 고아가 된다.
  const parentAlive =
    root.page.parentId === null || data.pages.some((p) => p.id === root.page.parentId);
  const reparentedToRoot = !parentAlive;
  const targetParent = parentAlive ? root.page.parentId : null;
  const siblings = data.pages.filter(
    (p) => p.spaceId === root.page.spaceId && p.parentId === targetParent,
  );
  root.page.parentId = targetParent;
  root.page.position = siblings.length + 1;

  const restoredIds = new Set(batch.map((t) => t.page.id));
  for (const entry of batch) {
    data.pages.push(clone(entry.page));
    data.versions.push(...entry.versions.map(clone));
    data.comments.push(...entry.comments.map(clone));
  }
  data.trash = data.trash.filter((t) => !restoredIds.has(t.page.id));
  persist();
  return {
    page: clone(data.pages.find((p) => p.id === id)!),
    reparentedToRoot,
    restoredCount: batch.length,
  };
}

/** 영구 삭제 — 되돌릴 수 없다. 루트와 함께 버린 하위를 통째로 없앤다. */
export async function purgePage(id: string): Promise<void> {
  const data = load();
  data.trash ??= [];
  const root = data.trash.find((t) => t.page.id === id);
  if (!root) throw new Error("휴지통에서 찾을 수 없습니다");
  const childrenOf = new Map<string | null, TrashEntry[]>();
  for (const entry of data.trash.filter((t) => t.page.spaceId === root.page.spaceId)) {
    const key = entry.page.parentId;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), entry]);
  }
  const doomed = new Set([id, ...collectBatch(childrenOf, id).map((t) => t.page.id)]);
  data.trash = data.trash.filter((t) => !doomed.has(t.page.id));
  for (const gone of doomed) delete data.labels?.[gone];
  persist();
}

export async function emptyTrash(spaceId: string): Promise<number> {
  const data = load();
  const doomed = (data.trash ?? []).filter((t) => t.page.spaceId === spaceId);
  data.trash = (data.trash ?? []).filter((t) => t.page.spaceId !== spaceId);
  for (const entry of doomed) delete data.labels?.[entry.page.id];
  persist();
  return doomed.length;
}

/** 함께 버려진 하위 — root=true인 노드는 별도 항목이므로 경계에서 멈춘다. */
function collectBatch(
  childrenOf: Map<string | null, TrashEntry[]>,
  rootId: string,
): TrashEntry[] {
  const found: TrashEntry[] = [];
  const visited = new Set([rootId]);
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    for (const child of childrenOf.get(queue.shift()!) ?? []) {
      if (child.root || visited.has(child.page.id)) continue;
      visited.add(child.page.id);
      found.push(child);
      queue.push(child.page.id);
    }
  }
  return found;
}
