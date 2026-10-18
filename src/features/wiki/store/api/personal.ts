// 별표·최근 방문·내 작업·리액션(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { type TreeItemDto, mapPageTree, toBackendId } from "../mapping";
import type { MyTask, ReactionSummary, StarredPageRow, StarsSnapshot } from "../types";
import { json } from "./http";

interface StarRowDto {
  page: TreeItemDto;
  spaceId: number | string;
  spaceName: string | null;
}

function mapStarRow(row: StarRowDto): StarredPageRow {
  const page = mapPageTree([row.page])[0];
  return {
    id: page.id,
    spaceId: String(row.spaceId),
    spaceName: row.spaceName,
    title: page.title,
    icon: page.icon ?? null,
    type: page.type,
  };
}

export async function listStars(): Promise<StarsSnapshot> {
  const dto = await json<{ spaceIds: string[]; pages: StarRowDto[] }>(
    await sharedApiFetch("/api/wiki/stars"));
  return {
    spaceIds: (dto.spaceIds ?? []).map(String),
    pages: (dto.pages ?? []).map(mapStarRow),
  };
}

export async function setPageStar(pageId: string, starred: boolean): Promise<void> {
  await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/star`, {
    method: starred ? "PUT" : "DELETE",
  });
}

export async function setSpaceStar(spaceId: string, starred: boolean): Promise<void> {
  await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/star`, {
    method: starred ? "PUT" : "DELETE",
  });
}

export async function listRecentPages(limit = 10): Promise<StarredPageRow[]> {
  const rows = await json<StarRowDto[]>(await sharedApiFetch(`/api/wiki/recent?limit=${limit}`));
  return rows.map(mapStarRow);
}

/**
 * 내 초안 목록(F-04) — **제안 계약** `GET /api/wiki/drafts?limit=`(최근 방문과 같은 행 모양:
 * `{page, spaceId, spaceName}`, 내가 만든 초안, 최근 수정순). 서버에 아직 없으면(404) null을 준다 —
 * 화면은 그 탭을 숨긴다(없는 기능을 빈 목록으로 꾸미지 않는다). 그 밖의 실패는 던진다.
 */
export async function listMyDrafts(limit = 50): Promise<StarredPageRow[] | null> {
  const res = await sharedApiFetch(`/api/wiki/drafts?limit=${limit}`);
  if (res.status === 404) return null;
  return (await json<StarRowDto[]>(res)).map(mapStarRow);
}

/* ── 액션 아이템(W23) ────────────────────────────────────── */
interface TaskDto {
  pageId: number | string; spaceId: number | string; spaceName: string | null; pageTitle: string;
  lineNo: number; text: string; assigneeId: number | string | null; dueDate: string | null; done: boolean;
}

function mapTask(t: TaskDto): MyTask {
  return {
    pageId: String(t.pageId),
    spaceId: String(t.spaceId),
    spaceName: t.spaceName,
    pageTitle: t.pageTitle,
    lineNo: t.lineNo,
    text: t.text,
    assigneeId: t.assigneeId === null ? null : String(t.assigneeId),
    dueDate: t.dueDate,
    done: t.done,
  };
}

export async function listMyTasks(done: boolean): Promise<MyTask[]> {
  const rows = await json<TaskDto[]>(await sharedApiFetch(`/api/wiki/tasks/mine?done=${done}`));
  return rows.map(mapTask);
}

/** 체크 토글은 그 문서의 본문을 다시 쓰는 편집이다 — 리비전이 남는다. */
export async function setTaskDone(pageId: string, lineNo: number, done: boolean): Promise<MyTask> {
  return mapTask(await json<TaskDto>(await sharedApiFetch(
    `/api/wiki/pages/${toBackendId(pageId)}/tasks/${lineNo}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }) })));
}

/* ── 리액션(W23) ─────────────────────────────────────────── */
/** 응답은 바뀐 뒤의 집계다 — 화면이 낙관적으로 그린 것을 이 값으로 덮는다. */
export async function listPageReactions(pageId: string): Promise<ReactionSummary[]> {
  return json<ReactionSummary[]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/reactions`));
}

export async function setPageReaction(pageId: string, emoji: string, on: boolean): Promise<ReactionSummary[]> {
  return json<ReactionSummary[]>(await sharedApiFetch(
    `/api/wiki/pages/${toBackendId(pageId)}/reactions/${encodeURIComponent(emoji)}`,
    { method: on ? "PUT" : "DELETE" }));
}

export async function setCommentReaction(commentId: string, emoji: string, on: boolean): Promise<ReactionSummary[]> {
  return json<ReactionSummary[]>(await sharedApiFetch(
    `/api/wiki/comments/${toBackendId(commentId)}/reactions/${encodeURIComponent(emoji)}`,
    { method: on ? "PUT" : "DELETE" }));
}

/* ── 검색 색인 관리(전역 관리자, W23) ────────────────────── */
