// 휴지통·보관(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { type PageDto, mapPage, toBackendId, toClientId } from "../mapping";
import type { Page, PageRestoreResult, TrashItem } from "../types";
import { json } from "./http";

/* ── 보관(W23) — 목록 행은 휴지통과 같은 모양(TrashItem)이라 매핑을 공유한다 ── */
function mapTrashRows(rows: Array<{
  id: number; title: string; type: string; icon: string | null;
  deletedAt: string; deletedBy: number; descendantCount: number;
}>): TrashItem[] {
  return rows.map((r) => ({
    id: toClientId(r.id),
    title: r.title,
    type: r.type === "folder" ? "folder" : "page",
    icon: r.icon,
    deletedAt: r.deletedAt,
    deletedBy: toClientId(r.deletedBy),
    descendantCount: r.descendantCount,
  }));
}

export async function listArchive(spaceId: string): Promise<TrashItem[]> {
  return mapTrashRows(await json(await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/archive`)));
}

export async function archivePage(id: string): Promise<Page> {
  return mapPage(await json(await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/archive`, { method: "POST" })));
}

export async function unarchivePage(id: string): Promise<Page> {
  return mapPage(await json(await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/unarchive`, { method: "POST" })));
}

export async function listTrash(spaceId: string): Promise<TrashItem[]> {
  const rows = await json<Array<{
    id: number; title: string; type: string; icon: string | null;
    deletedAt: string; deletedBy: number; descendantCount: number;
  }>>(await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/trash`));
  return rows.map((r) => ({
    id: toClientId(r.id),
    title: r.title,
    type: r.type === "folder" ? "folder" : "page",
    icon: r.icon,
    deletedAt: r.deletedAt,
    deletedBy: toClientId(r.deletedBy),
    descendantCount: r.descendantCount,
  }));
}

export async function restorePage(id: string): Promise<PageRestoreResult> {
  const body = await json<{
    page: PageDto; reparentedToRoot: boolean; restoredCount: number;
  }>(await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/restore`, { method: "POST" }));
  return {
    page: mapPage(body.page),
    reparentedToRoot: body.reparentedToRoot,
    restoredCount: body.restoredCount,
  };
}

export async function purgePage(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/purge`, { method: "DELETE" }));
}

export async function emptyTrash(spaceId: string): Promise<number> {
  const body = await json<{ purged: number }>(
    await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/trash`, { method: "DELETE" }));
  return body.purged;
}
