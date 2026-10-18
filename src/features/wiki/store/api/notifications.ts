// 알림·알림 설정·구독·공유(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { toBackendId } from "../mapping";
import type { NotificationList, NotificationPrefs, NotificationPrefsPatch, NotificationType } from "../types";
import { json } from "./http";

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

/* ── 스페이스 구독(W27-4) ─────────────────────────────────── */

export async function getSpaceWatchState(spaceId: string): Promise<boolean> {
  const body = await json<{ watching: boolean }>(
    await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/watch`));
  return body.watching;
}

export async function setSpaceWatchState(spaceId: string, watching: boolean): Promise<boolean> {
  const body = await json<{ watching: boolean }>(
    await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/watch`, {
      method: watching ? "PUT" : "DELETE",
    }));
  return body.watching;
}

/* ── 소유자·검증(W27-5) ───────────────────────────────────── */

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
/** signal: 알림 벨의 주기 갱신이 걸린 요청을 끊고 새로 읽을 때 쓴다(요청을 겹치지 않게). */
export async function listNotifications(options: { signal?: AbortSignal } = {}): Promise<NotificationList> {
  const body = await json<{
    unreadCount: number;
    items: Array<{
      id: number; type: string; pageId: number; spaceId: number | null; pageTitle: string;
      actorId: number; createdAt: string; read: boolean; note?: string | null;
    }>;
  }>(await (options.signal
    ? sharedApiFetch("/api/wiki/notifications", { signal: options.signal })
    : sharedApiFetch("/api/wiki/notifications")));
  const typeOf = (t: string): NotificationType =>
    t === "MENTIONED" ? "mentioned"
      : t === "COMMENT" ? "comment"
        : t === "SHARED" ? "shared"
          : t === "PAGE_PUBLISHED" ? "page_published"
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

/** 페이지 공유(W23) — 돌려주는 값은 실제로 전달된 수(볼 수 없는 수신자는 조용히 빠진다). */
export async function sharePage(pageId: string, userIds: string[], note?: string): Promise<number> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds: userIds.map(toBackendId), note: note?.trim() || null }),
  });
  return (await json<{ delivered: number }>(res)).delivered;
}
