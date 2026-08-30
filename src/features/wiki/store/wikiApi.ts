// wiki-backend 어댑터. 각 태스크에서 REST 구현으로 교체한다. 미구현분은 목업 위임.
export { __resetForTest } from "./wikiMock";

import { sharedApiFetch, sharedApiUpload, sharedCollaborationFetch } from "./apiClient";
import { mapComment, mapSpace, mapPage, mapPageTree, mapVersionMeta, mapVersionFull, toBackendId, toClientId, extractError, type CommentDto, type PageDto, type TreeItemDto, mapPageNode, type PageNodeDto } from "./mapping";
import {
  ContentSearchError,
  MoveImpactError,
  type Attachment,
  type Comment,
  type AttachmentUploadOptions,
  type CollaborationBootstrap,
  type CollaborationDraftCommit,
  type CollaborationDraftCommitOptions,
  type CollaborationTicket,
  type DeletePageOptions,
  type BlogPost,
  type NotificationList,
  type NotificationPrefs,
  type NotificationPrefsPatch,
  type NotificationType,
  type PageRestrictions,
  type RestrictionPrincipal,
  type Team,
  type Page,
  PageConflictError,
  type PageStatus,
  type PageType,
  type PageVersion,
  type SearchContentInput,
  type CommentAnchor,
  type LabelCount,
  type CopyPageOptions,
  type AttachmentVersion,
  type AuditEntry,
  type MyTask,
  type TeamMember,
  type PagePath,
  type ReactionSummary,
  type ReindexJob,
  type SearchIndexStatus,
  type StarredPageRow,
  type StarsSnapshot,
  type PageTemplate,
  type TemplateInput,
  type PageNode,
  type PageRestoreResult,
  type SpaceGrant,
  type SearchResults,
  type Space,
  type TrashItem,
  type UpdatePageOptions,
  type User,
} from "./types";

/** 백엔드 응답(JSON) 파싱 + 4xx/5xx를 한국어 에러로 변환. 이후 태스크(pages/versions/attachments)도 재사용. */
async function json<T>(res: Response): Promise<T> {
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(extractError(res.status, body));
  return body as T;
}

export async function getCurrentUser(): Promise<User> {
  const me = await json<{ id: number | string; name?: string; email?: string }>(await sharedApiFetch("/api/me"));
  return { id: String(me.id), name: me.name ?? me.email ?? `사용자 #${me.id}` };
}
export async function listUsers(): Promise<User[]> {
  // org-service 사용자 디렉터리 — JWT 로그인 시 member로 미러링된 실사용자 목록.
  // ACTIVE만 노출한다(비활성 계정은 멘션·선택 UI에 나오면 안 된다). 디렉터리 장애가
  // 화면 전체를 죽이면 안 되므로 실패는 빈 목록 — 이름은 authorName 스냅샷/폴백이 대신한다.
  try {
    const rows = await json<{ id: number; displayName: string; email?: string | null; status: string }[]>(
      await sharedApiFetch("/api/org/members"),
    );
    return rows
      .filter((m) => m.status === "ACTIVE")
      .map((m) => ({ id: String(m.id), name: m.displayName }));
  } catch {
    return [];
  }
}
/** 화면이 updatedBy/authorId(숫자 id)를 이름으로 못 찾을 때 쓰는 폴백. (호출부 후속 배선.) */
export function displayUserName(id: string): string {
  return `사용자 #${id}`;
}

// ── comments ─────────────────────────────────────────────────
// 서버 영속(P0-004) — 규칙은 목업과 동일: 1단 답글, 작성자만 수정/삭제(+스페이스 ADMIN
// moderation), 최상위 삭제 시 답글 연쇄, 무변경 수정은 "(수정됨)"을 남기지 않는다.

export async function listComments(pageId: string): Promise<Comment[]> {
  const rows = await json<CommentDto[]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/comments`),
  );
  return rows.map(mapComment);
}

export async function addComment(
  pageId: string,
  body: string,
  parentId?: string | null,
  anchor?: CommentAnchor | null,
): Promise<Comment> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      body,
      parentId: parentId == null ? null : toBackendId(parentId),
      ...(anchor ? { anchorQuote: anchor.quote, anchorOccurrence: anchor.occurrence } : {}),
    }),
  });
  return mapComment(await json<CommentDto>(res));
}

/* ── 인라인 댓글·구독(W21-4) ─────────────────────────────── */

export async function setCommentResolved(id: string, resolved: boolean): Promise<Comment> {
  const res = await sharedApiFetch(`/api/wiki/comments/${toBackendId(id)}/resolved`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolved }),
  });
  return mapComment(await json<CommentDto>(res));
}

export async function getWatchState(pageId: string): Promise<boolean> {
  const body = await json<{ watching: boolean }>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/watch`));
  return body.watching;
}

export async function setWatchState(pageId: string, watching: boolean): Promise<boolean> {
  const body = await json<{ watching: boolean }>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/watch`, {
      method: watching ? "POST" : "DELETE",
    }));
  return body.watching;
}

export async function updateComment(id: string, body: string): Promise<Comment> {
  const res = await sharedApiFetch(`/api/wiki/comments/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return mapComment(await json<CommentDto>(res));
}

export async function deleteComment(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/wiki/comments/${toBackendId(id)}`, { method: "DELETE" }));
}

export async function listSpaces(): Promise<Space[]> {
  const dtos = await json<Parameters<typeof mapSpace>[0][]>(await sharedApiFetch("/api/wiki/spaces"));
  return dtos.map(mapSpace);
}
export async function createSpace(input: { key: string; name: string }): Promise<Space> {
  const res = await sharedApiFetch("/api/wiki/spaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: input.key.trim().toLowerCase(), name: input.name.trim() }),
  });
  return mapSpace(await json(res));
}

export async function getPage(id: string): Promise<Page | null> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`);
  if (res.status === 404) return null;
  return mapPage(await json(res));
}
/** 폴더(type)·초안(status)은 백엔드 V2가 받는다 — 목업과 같은 의미론이다. */
export async function createPage(input: { spaceId: string; parentId?: string | null; title: string; body?: string; type?: PageType; status?: PageStatus }): Promise<Page> {
  const res = await sharedApiFetch("/api/wiki/pages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spaceId: toBackendId(input.spaceId),
      parentId: input.parentId ? toBackendId(input.parentId) : null,
      title: input.title.trim(), content: input.body ?? "",
      // 백엔드 V2 계약. 미지정이면 서버가 page/published로 채운다(폴더는 항상 published).
      type: input.type, status: input.status,
    }),
  });
  return mapPage(await json(res));
}
export async function updatePage(
  id: string,
  patch: { title?: string; body?: string },
  options: UpdatePageOptions = {},
): Promise<Page> {
  const current = await getPage(id);
  if (!current) throw new Error("페이지를 찾을 수 없습니다");
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: (patch.title ?? current.title).trim(),
      content: patch.body ?? current.body,
      parentId: current.parentId ? toBackendId(current.parentId) : null,
      // 편집 화면은 load-time version을 넘긴다. 저장 직전 조회한 current.version으로 바꾸면
      // stale 편집도 통과해 다른 사용자의 저장을 조용히 덮어쓴다.
      expectedVersion: options.expectedVersion ?? current.version,
      ...(options.changeNote ? { changeNote: options.changeNote } : {}),
    }),
  });
  if (res.status === 409) {
    const serverPage = await getPage(id).catch(() => null);
    throw new PageConflictError(serverPage);
  }
  return mapPage(await json(res));
}

/* ── 페이지 제한 (W18, V12 계약) ─────────────────────────── */

interface RestrictionPrincipalDto { type: string; id: number }
interface RestrictionsDto {
  view: RestrictionPrincipalDto[];
  edit: RestrictionPrincipalDto[];
  inherited: Array<{ pageId: number; pageTitle: string; principals: RestrictionPrincipalDto[] }>;
}

function mapPrincipal(p: RestrictionPrincipalDto): RestrictionPrincipal {
  return { type: p.type === "TEAM" ? "team" : "user", id: String(p.id) };
}

function mapRestrictions(dto: RestrictionsDto): PageRestrictions {
  return {
    view: dto.view.map(mapPrincipal),
    edit: dto.edit.map(mapPrincipal),
    inherited: dto.inherited.map((i) => ({
      pageId: String(i.pageId),
      pageTitle: i.pageTitle,
      principals: i.principals.map(mapPrincipal),
    })),
  };
}

function toPrincipalDto(p: RestrictionPrincipal) {
  return { type: p.type === "team" ? "TEAM" : "USER", id: toBackendId(p.id) };
}

export async function getPageRestrictions(pageId: string): Promise<PageRestrictions> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/restrictions`);
  return mapRestrictions(await json<RestrictionsDto>(res));
}

export async function setPageRestrictions(
  pageId: string,
  input: { view: RestrictionPrincipal[]; edit: RestrictionPrincipal[] },
): Promise<PageRestrictions> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/restrictions`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ view: input.view.map(toPrincipalDto), edit: input.edit.map(toPrincipalDto) }),
  });
  return mapRestrictions(await json<RestrictionsDto>(res));
}

/** org 팀 목록 — 제한 다이얼로그의 TEAM 주체 선택용. 디렉터리 장애가 화면을 죽이면 안 된다(빈 목록). */
export async function listTeams(): Promise<Team[]> {
  try {
    const rows = await json<Array<{ id: number; name: string }>>(await sharedApiFetch("/api/org/teams"));
    return rows.map((t) => ({ id: String(t.id), name: t.name }));
  } catch {
    return [];
  }
}

/* ── 스페이스 권한(W22) — org-service grant REST ─────────── */

interface GrantDto {
  id: number;
  subjectType: string;
  subjectId: number;
  resourceType: string;
  resourceId: string;
  role: string;
}

function mapGrant(dto: GrantDto): SpaceGrant {
  return {
    id: String(dto.id),
    subjectType: dto.subjectType === "TEAM" ? "team" : "user",
    subjectId: String(dto.subjectId),
    role: dto.role === "ADMIN" ? "admin" : dto.role === "EDITOR" ? "editor" : "viewer",
  };
}

/**
 * 이 스페이스의 권한 목록. 스페이스 ADMIN 또는 전역 관리자만 볼 수 있다(org-service 판정) —
 * 권한이 없으면 403이 그대로 올라온다. 화면이 조용히 빈 목록으로 덮으면 "권한이 없는 건지
 * 아무도 없는 건지"를 구분할 수 없다.
 */
export async function listSpaceGrants(spaceId: string): Promise<SpaceGrant[]> {
  const rows = await json<GrantDto[]>(
    await sharedApiFetch(`/api/org/grants?resourceType=SPACE&resourceId=${encodeURIComponent(spaceId)}`),
  );
  return rows.map(mapGrant);
}

export async function addSpaceGrant(
  spaceId: string,
  input: { subjectType: "user" | "team"; subjectId: string; role: SpaceGrant["role"] },
): Promise<SpaceGrant> {
  const res = await sharedApiFetch("/api/org/grants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subjectType: input.subjectType.toUpperCase(),
      subjectId: Number(input.subjectId),
      resourceType: "SPACE",
      resourceId: spaceId,
      role: input.role.toUpperCase(),
    }),
  });
  return mapGrant(await json<GrantDto>(res));
}

export async function removeSpaceGrant(grantId: string): Promise<void> {
  await json(await sharedApiFetch(`/api/org/grants/${grantId}`, { method: "DELETE" }));
}

/** 블로그(W24) — 트리 밖 글 목록, 최신순. 서버가 권한 필터와 발췌를 한다. */
export async function listBlogPosts(spaceId: string): Promise<BlogPost[]> {
  const rows = await json<Array<{
    id: number; title: string; status: PageStatus; icon: string | null;
    createdBy: number; updatedBy: number; createdAt: string; updatedAt: string; excerpt: string;
  }>>(await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/blog`));
  return rows.map((r) => ({
    id: String(r.id), title: r.title, status: r.status ?? "published", icon: r.icon ?? null,
    createdBy: toClientId(r.createdBy), updatedBy: toClientId(r.updatedBy),
    createdAt: r.createdAt, updatedAt: r.updatedAt, excerpt: r.excerpt ?? "",
  }));
}

/** 알림 설정(W23) — 이메일 채널 스위치. 주소는 서버가 토큰에서 스냅샷한다(V29). */
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  return json<NotificationPrefs>(await sharedApiFetch("/api/wiki/notifications/prefs"));
}

export async function updateNotificationPrefs(patch: NotificationPrefsPatch): Promise<NotificationPrefs> {
  return json<NotificationPrefs>(
    await sharedApiFetch("/api/wiki/notifications/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

/** 알림 — 백엔드 V11 계약. 타입은 서버 enum(MENTIONED…)을 프론트 소문자로 매핑한다. */
export async function listNotifications(): Promise<NotificationList> {
  const body = await json<{
    unreadCount: number;
    items: Array<{
      id: number; type: string; pageId: number; spaceId: number | null; pageTitle: string;
      actorId: number; createdAt: string; read: boolean; note?: string | null;
    }>;
  }>(await sharedApiFetch("/api/wiki/notifications"));
  const typeOf = (t: string): NotificationType =>
    t === "MENTIONED" ? "mentioned"
      : t === "COMMENT" ? "comment"
        : t === "SHARED" ? "shared"
          : "page_updated";
  return {
    unreadCount: body.unreadCount,
    items: body.items.map((n) => ({
      id: String(n.id),
      userId: "",
      type: typeOf(n.type),
      pageId: String(n.pageId),
      spaceId: n.spaceId === null ? "" : String(n.spaceId),
      pageTitle: n.pageTitle,
      actorId: String(n.actorId),
      createdAt: n.createdAt,
      read: n.read,
      note: n.note ?? null,
    })),
  };
}

export async function markNotificationsRead(ids: string[] = []): Promise<void> {
  await json(await sharedApiFetch("/api/wiki/notifications/read", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: ids.map(toBackendId) }),
  }));
}

/** 이모지 아이콘 설정/해제 — 메타데이터 변경(버전 스냅샷 없음). 백엔드 V10 계약. */
export async function setPageIcon(id: string, icon: string | null): Promise<Page> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/icon`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ icon }),
  });
  return mapPage(await json(res));
}

/** 조회 1회 기록 — 실패해도 화면을 막으면 안 되는 부가 신호라 호출부에서 무시 가능해야 한다. */
export async function recordPageView(id: string): Promise<number> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/views`, { method: "POST" });
  const body = await json<{ views: number }>(res);
  return body.views;
}

/** Yjs projection과 page revision, collaboration generation을 서버의 단일 transaction으로 확정한다. */
export async function commitCollaborationDraft(
  id: string,
  patch: { title: string; body: string },
  options: CollaborationDraftCommitOptions,
): Promise<CollaborationDraftCommit> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/collaboration-draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: patch.title.trim(),
      content: patch.body,
      expectedPageVersion: options.expectedVersion,
      expectedGeneration: options.expectedGeneration,
    }),
  });
  if (res.status === 409) {
    const serverPage = await getPage(id).catch(() => null);
    throw new PageConflictError(serverPage);
  }
  const response = await json<{
    page: Parameters<typeof mapPage>[0];
    generation: number;
  }>(res);
  if (!response.page || !Number.isSafeInteger(response.generation) || response.generation <= 0) {
    throw new Error("공동 초안 저장 결과를 확인할 수 없습니다");
  }
  return { page: mapPage(response.page), generation: response.generation };
}

/** Access Token 대신 WebSocket 인증 메시지에만 실을 1회용 ticket을 발급받는다. */
export async function requestCollaborationTicket(pageId: string): Promise<CollaborationTicket> {
  const response = await json<CollaborationTicket>(await sharedApiFetch(
    `/api/wiki/pages/${toBackendId(pageId)}/collaboration-ticket`,
    { method: "POST", cache: "no-store" },
  ));
  if (
    typeof response.ticket !== "string"
    || typeof response.room !== "string"
    || typeof response.websocketPath !== "string"
    || typeof response.expiresAt !== "string"
  ) {
    throw new Error("공동 편집 연결 정보를 확인할 수 없습니다");
  }
  return response;
}

/** 기존 page revision을 shared Y.Doc에 최초 한 번만 넣는다. ticket은 이 요청에서 소비된다. */
export async function bootstrapCollaborationDocument(
  pageId: string,
  basePageVersion: number,
  ticket: string,
  state: Uint8Array,
): Promise<CollaborationBootstrap> {
  const response = await json<CollaborationBootstrap>(await sharedCollaborationFetch(
    `/api/wiki/collaboration/pages/${toBackendId(pageId)}/bootstrap`,
    ticket,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Wiki-Page-Version": String(basePageVersion),
      },
      body: state as BodyInit,
    },
  ));
  if (
    typeof response.created !== "boolean"
    || !Number.isSafeInteger(response.basePageVersion)
    || response.basePageVersion <= 0
    || !Number.isSafeInteger(response.generation)
    || response.generation <= 0
  ) {
    throw new Error("공동 편집 문서 정보를 확인할 수 없습니다");
  }
  return response;
}
/** 초안 게시(백엔드 V2). 이미 게시됐으면 서버가 멱등 처리하고 같은 문서를 돌려준다. */
export async function publishPage(id: string): Promise<Page> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/publish`, { method: "POST" });
  return mapPage(await json(res));
}
/**
 * 자식 처리는 서버가 한 트랜잭션에서 수행한다(백엔드 V2 `?children=`).
 * 옵션 없이 자식이 있으면 서버가 409 + "하위 페이지가 있어 삭제할 수 없습니다" — 목업과 같은 계약이다.
 */
export async function deletePage(id: string, options?: DeletePageOptions): Promise<void> {
  const query = options?.children ? `?children=${options.children}` : "";
  await json(await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}${query}`, { method: "DELETE" }));
}

/* ── 지연 트리(2026-08-28) ─────────────────── */

async function nodes(path: string): Promise<PageNode[]> {
  const rows = await json<PageNodeDto[]>(await sharedApiFetch(path));
  return rows.map(mapPageNode);
}

export async function listChildren(
  spaceId: string,
  parentId: string | null = null,
): Promise<PageNode[]> {
  const query = parentId === null ? "" : `?parentId=${toBackendId(parentId)}`;
  return nodes(`/api/wiki/spaces/${toBackendId(spaceId)}/pages/children${query}`);
}

export async function listAncestors(pageId: string): Promise<PageNode[]> {
  return nodes(`/api/wiki/pages/${toBackendId(pageId)}/ancestors`);
}

export async function listDescendants(pageId: string): Promise<PageNode[]> {
  return nodes(`/api/wiki/pages/${toBackendId(pageId)}/descendants`);
}

export async function lookupPagesByTitle(spaceId: string, titles: string[]): Promise<PageNode[]> {
  const wanted = titles.map((t) => t.trim()).filter((t) => t.length > 0);
  if (wanted.length === 0) return [];
  const query = wanted.map((t) => `title=${encodeURIComponent(t)}`).join("&");
  return nodes(`/api/wiki/spaces/${toBackendId(spaceId)}/pages/lookup?${query}`);
}

export async function listRecentlyUpdated(spaceId: string, limit = 8): Promise<PageNode[]> {
  return nodes(`/api/wiki/spaces/${toBackendId(spaceId)}/pages/recent?limit=${limit}`);
}

export async function updateSpace(
  spaceId: string,
  input: { name: string; description?: string },
): Promise<Space> {
  const res = await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name.trim(), description: input.description ?? null }),
  });
  return mapSpace(await json(res));
}

/** 되돌릴 수 없다 — 페이지·첨부·이력까지 함께 사라진다(서버가 스페이스 ADMIN만 허용). */
export async function deleteSpace(spaceId: string): Promise<void> {
  await json(await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}`, { method: "DELETE" }));
}

export async function listPagesByIds(spaceId: string, ids: string[]): Promise<PageNode[]> {
  if (ids.length === 0) return [];
  const query = ids.map((id) => `id=${toBackendId(id)}`).join("&");
  return nodes(`/api/wiki/spaces/${toBackendId(spaceId)}/pages/by-ids?${query}`);
}

export async function searchPageTitles(spaceId: string, query: string): Promise<PageNode[]> {
  const q = query.trim();
  if (!q) return [];
  return nodes(`/api/wiki/spaces/${toBackendId(spaceId)}/pages/search?q=${encodeURIComponent(q)}`);
}

/* ── 라벨·백링크(W21-2) ──────────────────────────────────── */

export async function listLabels(pageId: string): Promise<string[]> {
  return json<string[]>(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/labels`));
}

export async function setLabels(pageId: string, labels: string[]): Promise<string[]> {
  return json<string[]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/labels`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels }),
    }),
  );
}

/**
 * 접근 가능한 스페이스 전체의 라벨 후보 — 검색 화면의 라벨 필터 자동완성.
 * 검색 엔진을 타지 않으므로 OpenSearch 배포와 라이트 배포가 같은 답을 낸다.
 */
export async function suggestLabels(query: string): Promise<LabelCount[]> {
  return json<LabelCount[]>(
    await sharedApiFetch(`/api/wiki/labels?q=${encodeURIComponent(query.trim())}`));
}

/** 검색 결과가 "어디에 있는 문서인지" 그리려고 여러 페이지의 조상 경로를 한 번에 받는다. */
export async function listPagePaths(pageIds: string[]): Promise<PagePath[]> {
  if (pageIds.length === 0) return [];
  const query = pageIds.map((id) => `id=${toBackendId(id)}`).join("&");
  const rows = await json<Array<{ id: number | string; titles: string[] }>>(
    await sharedApiFetch(`/api/wiki/pages/paths?${query}`));
  return rows.map((row) => ({ id: String(row.id), titles: row.titles ?? [] }));
}

export async function listSpaceLabels(spaceId: string): Promise<LabelCount[]> {
  return json<LabelCount[]>(
    await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/labels`));
}

export async function listPagesWithLabel(spaceId: string, name: string): Promise<Page[]> {
  const items = await json<TreeItemDto[]>(await sharedApiFetch(
    `/api/wiki/spaces/${toBackendId(spaceId)}/labels/${encodeURIComponent(name)}/pages`));
  return mapPageTree(items);
}

export async function listBacklinks(pageId: string): Promise<Page[]> {
  const items = await json<TreeItemDto[]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/backlinks`));
  return mapPageTree(items);
}

/* ── 휴지통(W21-1) ───────────────────────────────────────── */

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

/** 페이지 복제 — 서버가 첨부 복사·본문 참조 재작성·하위 계층까지 한다. */
export async function copyPage(id: string, options?: CopyPageOptions): Promise<Page> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      includeDescendants: options?.includeDescendants ?? false,
      includeRestrictions: options?.includeRestrictions ?? true,
    }),
  });
  return mapPage(await json(res));
}

/* ── 페이지 템플릿(W23) ──────────────────────────────────── */

function mapTemplate(dto: {
  id: number | string;
  spaceId: number | string;
  name: string;
  description: string | null;
  icon: string | null;
  content: string;
  updatedAt: string | null;
}): PageTemplate {
  return {
    id: String(dto.id),
    spaceId: String(dto.spaceId),
    name: dto.name,
    description: dto.description ?? null,
    icon: dto.icon ?? null,
    content: dto.content ?? "",
    updatedAt: dto.updatedAt ?? null,
  };
}

export async function listTemplates(spaceId: string): Promise<PageTemplate[]> {
  const rows = await json<Parameters<typeof mapTemplate>[0][]>(
    await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/templates`));
  return rows.map(mapTemplate);
}

export async function createTemplate(spaceId: string, input: TemplateInput): Promise<PageTemplate> {
  return mapTemplate(await json(await sharedApiFetch(
    `/api/wiki/spaces/${toBackendId(spaceId)}/templates`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })));
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<PageTemplate> {
  return mapTemplate(await json(await sharedApiFetch(
    `/api/wiki/templates/${toBackendId(id)}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })));
}

export async function deleteTemplate(id: string): Promise<void> {
  await sharedApiFetch(`/api/wiki/templates/${toBackendId(id)}`, { method: "DELETE" });
}

/** 지금 있는 페이지를 템플릿으로 — 이름을 생략하면 서버가 그 페이지 제목을 쓴다. */
export async function savePageAsTemplate(pageId: string, name?: string): Promise<PageTemplate> {
  return mapTemplate(await json(await sharedApiFetch(
    `/api/wiki/pages/${toBackendId(pageId)}/save-as-template`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(name ? { name } : {}),
    })));
}

export async function movePage(
  id: string,
  target: {
    parentId: string | null;
    beforeId?: string | null;
    spaceId?: string;
    children?: "with" | "promote";
    confirmImpact?: boolean;
  },
): Promise<Page> {
  // V9 전용 move — 부모와 형제 순서를 한 트랜잭션으로. 이동은 편집이 아니라 version 불변이며,
  // 예전 PUT 경유(조회→전체 갱신)의 버전 증가·경합 문제가 함께 사라졌다(P1-001).
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parentId: target.parentId ? toBackendId(target.parentId) : null,
      beforeId: target.beforeId ? toBackendId(target.beforeId) : null,
      spaceId: target.spaceId ? toBackendId(target.spaceId) : null,
      children: target.children ?? null,
      confirmImpact: target.confirmImpact ?? false,
    }),
  });
  // W18 이동 영향 — 409에 impact가 실리면 확인 다이얼로그 분기용 오류로 변환
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      impact?: { newlyRestrictedBy?: Array<{ pageId: number; pageTitle: string; principals: RestrictionPrincipalDto[] }> };
    } | null;
    if (body?.impact?.newlyRestrictedBy) {
      throw new MoveImpactError(
        body.error ?? "이동 영향 확인이 필요합니다",
        body.impact.newlyRestrictedBy.map((i) => ({
          pageId: String(i.pageId),
          pageTitle: i.pageTitle,
          principals: i.principals.map(mapPrincipal),
        })),
      );
    }
    throw new Error(body?.error ?? "이동 충돌이 발생했습니다");
  }
  return mapPage(await json(res));
}

export async function listVersions(pageId: string): Promise<PageVersion[]> {
  const metas = await json<Parameters<typeof mapVersionMeta>[0][]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/revisions`),
  );
  return metas.map((m) => mapVersionMeta(m, pageId)); // 백엔드가 최신순 보장
}
/**
 * 한 버전의 본문까지 읽는다. 목록(listVersions)은 메타만 주므로 미리보기·비교는 이걸 쓴다 —
 * 이력이 수십 개인 문서의 본문을 목록 한 번에 전부 실어 보낼 이유가 없다.
 */
export async function getVersion(pageId: string, versionId: string): Promise<PageVersion> {
  const version = Number(versionId.split(":")[1]);
  const dto = await json<Parameters<typeof mapVersionFull>[0]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/revisions/${version}`),
  );
  return mapVersionFull(dto, pageId);
}

export async function restoreVersion(pageId: string, versionId: string): Promise<Page> {
  // versionId는 어댑터가 만든 `${pageId}:${version}` — 버전 번호를 추출해 restore 엔드포인트 호출.
  const version = Number(versionId.split(":")[1]);
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/revisions/${version}/restore`, { method: "POST" });
  return mapPage(await json(res));
}

interface AttDto {
  id: number;
  pageId?: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  version?: number;
}
function mapAtt(d: AttDto, pageId: string): Attachment {
  return {
    id: String(d.id),
    pageId,
    filename: d.filename,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    checksumSha256: d.checksumSha256,
    version: d.version,
  };
}

export async function listAttachments(pageId: string): Promise<Attachment[]> {
  const dtos = await json<AttDto[]>(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/attachments`));
  return dtos.map((d) => mapAtt(d, pageId));
}
export async function uploadAttachment(
  pageId: string,
  file: File,
  options: AttachmentUploadOptions = {},
): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);
  const path = `/api/wiki/pages/${toBackendId(pageId)}/attachments${options.pending ? "?pending=true" : ""}`;
  // 진행률/취소가 필요한 에디터 경로는 XHR, 일반 첨부는 기존 fetch 경로를 유지한다.
  // 둘 다 Content-Type을 직접 지정하지 않아 브라우저가 multipart boundary를 채운다.
  const res = options.onProgress || options.signal
    ? await sharedApiUpload(path, form, options)
    : await sharedApiFetch(path, { method: "POST", body: form });
  return mapAtt(await json(res), pageId);
}
export async function confirmAttachments(pageId: string, attachmentIds: string[]): Promise<void> {
  if (!attachmentIds.length) return;
  await json(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/attachments/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachmentIds: attachmentIds.map(toBackendId) }),
  }));
}
export async function listAttachmentVersions(id: string): Promise<AttachmentVersion[]> {
  const rows = await json<Array<{
    version: number;
    contentType: string;
    sizeBytes: number;
    uploadedBy: number | string;
    createdAt: string | null;
  }>>(await sharedApiFetch(`/api/wiki/attachments/${toBackendId(id)}/versions`));
  return rows.map((r) => ({ ...r, uploadedBy: String(r.uploadedBy) }));
}

export async function restoreAttachmentVersion(id: string, version: number): Promise<Attachment> {
  const res = await sharedApiFetch(
    `/api/wiki/attachments/${toBackendId(id)}/versions/${version}/restore`, { method: "POST" });
  const dto = await json<AttDto>(res);
  return mapAtt(dto, String(dto.pageId));
}

/** 지난 버전 내려받기 — 인증이 필요한 경로라 화면이 fetch로 받아 저장한다. */
export function attachmentVersionUrl(id: string, version: number): string {
  return `${import.meta.env.VITE_API_BASE ?? ""}/api/wiki/attachments/${toBackendId(id)}/versions/${version}`;
}

/* ── 별표·최근 방문(W23) ─────────────────────────────────── */

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

/** 스페이스 삭제 기록(V30) — 전역 관리자만. 아니면 403이 그대로 올라온다. */
export async function listSpaceDeletions(): Promise<AuditEntry[]> {
  const rows = await json<Array<{
    id: number | string; action: string; targetType: string; targetId: number | string | null;
    targetLabel: string; detail: string | null; actorId: number | string; createdAt: string | null;
  }>>(await sharedApiFetch("/api/wiki/audit/space-deletions"));
  return rows.map((r) => ({
    ...r, id: String(r.id), targetId: r.targetId === null ? null : String(r.targetId), actorId: String(r.actorId),
  }));
}

/** 스페이스 감사 로그(W23) — 스페이스 ADMIN만. 아니면 403이 그대로 올라온다. */
export async function listAudit(spaceId: string): Promise<AuditEntry[]> {
  const rows = await json<Array<{
    id: number | string;
    action: string;
    targetType: string;
    targetId: number | string | null;
    targetLabel: string;
    detail: string | null;
    actorId: number | string;
    createdAt: string | null;
  }>>(await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/audit`));
  return rows.map((r) => ({
    ...r,
    id: String(r.id),
    targetId: r.targetId === null ? null : String(r.targetId),
    actorId: String(r.actorId),
  }));
}

/**
 * 스페이스 권한 변경 이력(org-service).
 *
 * 위키 감사와 **같은 모양**으로 온다 — 화면이 두 기록을 한 목록으로 합치기 때문이다.
 * 권한이 없으면 403이 그대로 올라온다(위키 감사와 같은 취급).
 */
export async function listGrantAudit(spaceId: string): Promise<AuditEntry[]> {
  return json<AuditEntry[]>(await sharedApiFetch(
    `/api/org/grants/audit?resourceType=SPACE&resourceId=${encodeURIComponent(spaceId)}`));
}

/** 페이지 공유(W23) — 돌려주는 값은 실제로 전달된 수(볼 수 없는 수신자는 조용히 빠진다). */
export async function sharePage(pageId: string, userIds: string[], note?: string): Promise<number> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: userIds.map(toBackendId), note: note?.trim() || null }),
  });
  return (await json<{ delivered: number }>(res)).delivered;
}

/** 내 개인 스페이스 — 없으면 서버가 만든다(멱등). */
export async function ensurePersonalSpace(): Promise<Space> {
  return mapSpace(await json(await sharedApiFetch("/api/wiki/spaces/personal", { method: "POST" })));
}

/* ── 팀 관리(W23) — org-service. 쓰기는 GLOBAL ADMIN, 서버가 403으로 거절한다 ── */
export async function createTeam(name: string): Promise<Team> {
  const t = await json<{ id: number; name: string }>(await sharedApiFetch("/api/org/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }));
  return { id: String(t.id), name: t.name };
}

export async function deleteTeam(teamId: string): Promise<void> {
  await sharedApiFetch(`/api/org/teams/${encodeURIComponent(teamId)}`, { method: "DELETE" });
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const rows = await json<Array<{ memberId: number; displayName: string | null; role: string }>>(
    await sharedApiFetch(`/api/org/teams/${encodeURIComponent(teamId)}/members`));
  return rows.map((r) => ({ memberId: String(r.memberId), displayName: r.displayName, role: r.role }));
}

export async function addTeamMember(teamId: string, memberId: string): Promise<void> {
  await sharedApiFetch(
    `/api/org/teams/${encodeURIComponent(teamId)}/members/${toBackendId(memberId)}`, { method: "PUT" });
}

export async function removeTeamMember(teamId: string, memberId: string): Promise<void> {
  await sharedApiFetch(
    `/api/org/teams/${encodeURIComponent(teamId)}/members/${toBackendId(memberId)}`, { method: "DELETE" });
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

/**
 * 색인 현황. **전역 관리자 여부를 확인하는 창구이기도 하다** — 아니면 403이 오고, 화면은
 * 관리 메뉴 자체를 감춘다. 그래서 403을 오류가 아니라 "권한 없음"으로 구분해 돌려준다.
 */
export async function getSearchIndexStatus(): Promise<SearchIndexStatus | null> {
  const res = await sharedApiFetch("/api/search/admin/reindex/status");
  if (res.status === 403) return null;
  return json<SearchIndexStatus>(res);
}

export async function startReindex(): Promise<ReindexJob> {
  return json<ReindexJob>(
    await sharedApiFetch("/api/search/admin/reindex", { method: "POST" }));
}

export async function getReindexJob(jobId: string): Promise<ReindexJob> {
  return json<ReindexJob>(
    await sharedApiFetch(`/api/search/admin/reindex/${encodeURIComponent(jobId)}`));
}

export function attachmentUrl(id: string): string {
  return `${import.meta.env.VITE_API_BASE ?? ""}/api/wiki/attachments/${toBackendId(id)}`;
}
/** 본문에 저장하는 durable 내부 참조. 절대 host·presigned URL을 저장하지 않는다. */
export function inlineAttachmentUrl(id: string): string {
  return `/api/wiki/attachments/${toBackendId(id)}/inline`;
}
export function attachmentIdFromInlineUrl(src: string): string | null {
  return /^\/api\/wiki\/attachments\/(\d+)\/inline$/.exec(src)?.[1] ?? null;
}
/** 메모리 AT를 붙여 받은 뒤 화면이 Blob URL로 변환한다. `<img src>` 직접 호출은 인증되지 않는다. */
export async function fetchInlineAttachment(id: string, signal?: AbortSignal): Promise<Blob> {
  const res = await sharedApiFetch(`/api/wiki/attachments/${toBackendId(id)}/inline`, { signal });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new Error(extractError(res.status, body));
  }
  return res.blob();
}
export async function deleteAttachment(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/wiki/attachments/${toBackendId(id)}`, { method: "DELETE" }));
}

const SEARCH_OPERATION = `
  query WikiSearch($input: SearchInput!) {
    search(input: $input) {
      total
      totalExact
      tookMs
      hits {
        id
        docType
        spaceId
        spaceKey
        spaceName
        pageId
        pageType
        title
        filename
        highlights
        updatedAt
        score
      }
    }
  }
`;

interface GraphQlSearchResponse {
  data?: { search?: SearchResults };
  errors?: Array<{
    extensions?: { code?: string; httpStatus?: number };
  }>;
}

function contentSearchError(status: number, code?: string): ContentSearchError {
  if (status === 429) {
    return new ContentSearchError("검색 요청이 너무 많습니다. 잠시 후 다시 시도하세요.", "rate-limited");
  }
  if (status === 503 || code === "SERVICE_UNAVAILABLE") {
    return new ContentSearchError("검색 서비스를 사용할 수 없습니다. 잠시 후 다시 시도하세요.", "unavailable");
  }
  if (status === 401) {
    return new ContentSearchError("로그인이 만료되었습니다. 다시 로그인하세요.", "unauthorized");
  }
  return new ContentSearchError("검색 결과를 불러올 수 없습니다. 다시 시도하세요.", "unknown");
}

/** Gateway `/api/search/graphql` 계약. HTTP 200 안의 GraphQL errors도 성공으로 삼키지 않는다. */
export async function searchContent(input: SearchContentInput): Promise<SearchResults> {
  const query = input.query.trim();
  if (!query) return { total: 0, totalExact: true, tookMs: 0, hits: [] };

  const res = await sharedApiFetch("/api/search/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "WikiSearch",
      query: SEARCH_OPERATION,
      variables: {
        input: {
          query,
          page: input.page ?? 0,
          size: input.size ?? 20,
          ...(input.spaceIds ? { spaceIds: input.spaceIds } : {}),
          ...(input.docTypes ? { docTypes: input.docTypes } : {}),
          ...(input.authorIds?.length ? { authorIds: input.authorIds } : {}),
          ...(input.updatedAfter ? { updatedAfter: input.updatedAfter } : {}),
          ...(input.updatedBefore ? { updatedBefore: input.updatedBefore } : {}),
          ...(input.labels?.length ? { labels: input.labels } : {}),
          ...(input.sort && input.sort !== "RELEVANCE" ? { sort: input.sort } : {}),
        },
      },
    }),
  });

  const body = (await res.json().catch(() => ({}))) as GraphQlSearchResponse;
  if (!res.ok) throw contentSearchError(res.status);
  const graphQlError = body.errors?.[0];
  if (graphQlError) {
    throw contentSearchError(
      graphQlError.extensions?.httpStatus ?? 500,
      graphQlError.extensions?.code,
    );
  }
  if (!body.data?.search) throw contentSearchError(500);
  return body.data.search;
}
