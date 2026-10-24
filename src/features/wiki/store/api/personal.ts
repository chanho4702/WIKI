// 별표·최근 방문·내 작업·리액션(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { type TreeItemDto, mapPageTree, toBackendId, toClientId } from "../mapping";
import type { FeedPageRow, MyTask, PersonPageRow, ReactionSummary, StarredPageRow, StarsSnapshot } from "../types";
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
 * 내 초안 목록(F-04) — `GET /api/wiki/drafts?limit=`(기본 20·최대 50, 최근 방문과 같은 행 모양:
 * `{page, spaceId, spaceName}`, 내가 만든 초안, 최근 수정순). 이 경로가 없는 구버전 서버(404)에서는 null을
 * 준다 — 화면은 그 탭을 숨긴다(없는 기능을 빈 목록으로 꾸미지 않는다). 그 밖의 실패는 던진다.
 */
export async function listMyDrafts(limit = 20): Promise<StarredPageRow[] | null> {
  const res = await sharedApiFetch(`/api/wiki/drafts?limit=${limit}`);
  if (res.status === 404) return null;
  return (await json<StarRowDto[]>(res)).map(mapStarRow);
}

/**
 * 사람 프로필의 최근 작업한 문서(F-07) — `GET /api/wiki/users/{userId}/pages?limit=`(wiki-backend 2026-10-24 구현).
 * 행 모양은 `/api/wiki/drafts`와 같고(`{page, spaceId, spaceName}`, page에 `updatedAt`), 그 사람이 만들었거나
 * 마지막으로 고친 문서를 최근 수정순으로, **호출자가 볼 수 있는 것만**(보기 제한·초안 규칙) 준다. 보관·휴지통·폴더 제외.
 * 404는 이 경로가 아직 배포되지 않은 서버뿐이다 — null을 주고 화면이 "아직 제공하지 않는다"를 알린다
 * (배포 순서가 갈리는 동안의 안전판, 빈 목록으로 꾸미지 않는다).
 * 통합 검색의 작성자 필터는 쓸 수 없다: 두 검색 엔진 모두 빈 검색어를 빈 결과로 돌려준다.
 */
export async function listPersonPages(userId: string, limit = 20): Promise<PersonPageRow[] | null> {
  if (!/^\d+$/.test(userId)) return [];
  const res = await sharedApiFetch(`/api/wiki/users/${toBackendId(userId)}/pages?limit=${limit}`);
  if (res.status === 404) return null;
  return (await json<StarRowDto[]>(res)).map((row) => ({
    ...mapStarRow(row),
    status: row.page.status ?? "published",
    updatedAt: row.page.updatedAt ?? null,
  }));
}

/* ── 홈 피드(2026-10-24) ──────────────────────────────────── */
interface FeedRowDto extends StarRowDto {
  viewCount?: number | null;
}

function mapFeedRow(row: FeedRowDto): FeedPageRow {
  return {
    ...mapStarRow(row),
    status: row.page.status ?? "published",
    updatedAt: row.page.updatedAt ?? null,
    updatedBy: row.page.updatedBy == null ? null : toClientId(row.page.updatedBy),
    viewCount: row.viewCount ?? 0,
  };
}

async function listFeed(path: string, limit: number): Promise<FeedPageRow[] | null> {
  const res = await sharedApiFetch(`${path}?limit=${limit}`);
  if (res.status === 404) return null;
  return (await json<FeedRowDto[]>(res)).map(mapFeedRow);
}

/**
 * 홈 "인기" — `GET /api/wiki/feed/popular?limit=`. 최근 90일 안에 수정된 게시 문서를 누적 조회수 내림차순
 * (동률은 최근 수정순). 404(아직 배포되지 않은 서버)면 null, 그 밖의 실패는 던진다.
 */
export function listPopularFeed(limit = 20): Promise<FeedPageRow[] | null> {
  return listFeed("/api/wiki/feed/popular", limit);
}

/**
 * 홈 "팔로잉" — `GET /api/wiki/feed/following?limit=`. 내가 구독한 스페이스의 문서 + 내가 구독한 문서(하위 아님)
 * 중 게시 문서, 최근 수정순. 공개 문서 인스턴스는 403이라 화면이 이 탭을 숨긴다. 404면 null.
 */
export function listFollowingFeed(limit = 20): Promise<FeedPageRow[] | null> {
  return listFeed("/api/wiki/feed/following", limit);
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

/**
 * 체크 토글은 그 문서의 본문을 다시 쓰는 편집이다 — 리비전이 남는다.
 * expectedText(화면이 본 그 줄의 항목 텍스트)를 주면 서버가 대조해 다르면 409다 — 그사이 위에 줄이 들어가
 * 줄 번호가 다른 항목을 가리키게 되면 남의 항목을 바꾸지 않고 거부한다.
 */
export async function setTaskDone(pageId: string, lineNo: number, done: boolean, expectedText?: string): Promise<MyTask> {
  return mapTask(await json<TaskDto>(await sharedApiFetch(
    `/api/wiki/pages/${toBackendId(pageId)}/tasks/${lineNo}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expectedText === undefined ? { done } : { done, text: expectedText }),
    })));
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
