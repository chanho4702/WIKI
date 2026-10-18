// 댓글·인라인 댓글(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { type CommentDto, mapComment, toBackendId } from "../mapping";
import type { Comment, CommentAnchor, CommentKind, CommentThreadPage } from "../types";
import { json } from "./http";

export async function listComments(pageId: string): Promise<Comment[]> {
  const rows = await json<CommentDto[]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/comments`),
  );
  return rows.map(mapComment);
}

/** 스레드 단위 한 쪽(CommentThreadPage) — 전량 목록(listComments)은 기존 호출자를 위해 그대로 둔다. */
export async function listCommentThreads(
  pageId: string,
  options: { kind?: CommentKind; before?: string | null; limit?: number } = {},
): Promise<CommentThreadPage> {
  const params = new URLSearchParams({ kind: options.kind ?? "page" });
  if (options.before) params.set("before", options.before);
  if (options.limit != null) params.set("limit", String(options.limit));
  const dto = await json<{
    items: CommentDto[];
    nextBefore: string | null;
    threadCount: number;
    commentCount: number;
  }>(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/comments/threads?${params.toString()}`));
  return {
    comments: dto.items.map(mapComment),
    nextBefore: dto.nextBefore ?? null,
    threadCount: dto.threadCount,
    commentCount: dto.commentCount,
  };
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
