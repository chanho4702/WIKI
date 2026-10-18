// 알림 트리거·알림함·알림 설정·구독·공유 목업(백엔드 V11과 같은 규칙).
import { CURRENT_USER_ID } from "../../../../mock/users";
import type {
  NotificationList,
  NotificationPrefs,
  NotificationPrefsPatch,
  NotificationType,
  Page,
  WikiData,
} from "../types";
import { load, persist } from "./db";

const MENTION_RE = /\]\(user:([\w-]+)\)/g;

function mentionIdsOf(body: string | undefined): Set<string> {
  const ids = new Set<string>();
  for (const m of (body ?? "").matchAll(MENTION_RE)) ids.add(m[1]);
  return ids;
}

/**
 * 알림 대상 = 페이지 구독자(W21-4) ∪ 스페이스 구독자(W27-4) ∪ 멘션된 사용자.
 * 백엔드 NotificationService.interestedIn과 같은 규칙이다 — Set이라 겹쳐도 한 번만 간다.
 * 전에는 "작성자 + 버전을 남긴 사람"을 계산했는데 그러면 끌 수가 없었다.
 */
function interestedIn(data: WikiData, page: Page, mentions: Set<string>): Set<string> {
  const users = subscribersOf(data, page);
  for (const id of mentions) users.add(id);
  return users;
}

/** 구독자만 — 페이지 구독자 ∪ 스페이스 구독자. 멘션은 포함하지 않는다. */
function subscribersOf(data: WikiData, page: Page): Set<string> {
  const users = new Set(data.watches?.[page.id] ?? []);
  for (const watcher of data.spaceWatches?.[page.spaceId] ?? []) users.add(watcher);
  return users;
}

/** 만들거나 고치거나 댓글을 단 문서는 자동 구독한다(컨플루언스와 같은 기본 동작). */
export function autoWatch(data: WikiData, pageId: string, userId: string): void {
  data.watches ??= {};
  const current = new Set(data.watches[pageId] ?? []);
  current.add(userId);
  data.watches[pageId] = [...current];
}

function deliver(data: WikiData, userId: string, type: NotificationType, page: Page) {
  // 초안은 작성자만 본다 — 구독자·멘션 대상에게 초안의 존재(제목)를 알림으로 흘리지 않는다
  if (page.status === "draft" && userId !== page.createdBy) return;
  const rows = (data.notifications ??= []);
  if (type !== "mentioned") {
    const unread = rows.find(
      (n) => n.userId === userId && n.pageId === page.id && n.type === type && !n.read,
    );
    if (unread) {
      unread.actorId = CURRENT_USER_ID;
      unread.createdAt = new Date().toISOString();
      unread.pageTitle = page.title;
      return;
    }
  }
  rows.push({
    id: `n${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId,
    type,
    pageId: page.id,
    spaceId: page.spaceId,
    pageTitle: page.title,
    actorId: CURRENT_USER_ID,
    createdAt: new Date().toISOString(),
    read: false,
  });
}

export function notifyPageUpdated(data: WikiData, page: Page, oldBody: string, newBody: string) {
  const before = mentionIdsOf(oldBody);
  const now = mentionIdsOf(newBody);
  const newlyMentioned = [...now].filter((id) => !before.has(id) && id !== CURRENT_USER_ID);
  for (const id of newlyMentioned) deliver(data, id, "mentioned", page);
  const interested = interestedIn(data, page, now);
  interested.delete(CURRENT_USER_ID);
  for (const id of newlyMentioned) interested.delete(id);
  for (const id of interested) deliver(data, id, "page_updated", page);
}

/**
 * 새 문서 게시(W27-4) — 스페이스 구독자가 기다리던 사건이다.
 * 곧바로 게시된 문서와 초안이 게시로 넘어가는 순간, 두 경로에서 한 번씩 부른다.
 *
 * 대상은 구독자만이다 — 본문에 멘션된 사람은 넣지 않는다. 문서 생성은 예전부터 멘션 알림의
 * 트리거가 아니었고, 여기서 게시로 대신 보내면 그 결정을 뒷문으로 뒤집는 셈이 된다.
 */
export function notifyPagePublished(data: WikiData, page: Page): void {
  const interested = subscribersOf(data, page);
  interested.delete(CURRENT_USER_ID); // 자기가 게시한 문서를 자기 알림함에서 다시 볼 이유가 없다
  for (const id of interested) deliver(data, id, "page_published", page);
}

export function notifyCommentAdded(data: WikiData, page: Page, commentBody: string): void {
  const mentioned = [...mentionIdsOf(commentBody)].filter((id) => id !== CURRENT_USER_ID);
  for (const id of mentioned) deliver(data, id, "mentioned", page);
  const interested = interestedIn(data, page, mentionIdsOf(page.body));
  interested.delete(CURRENT_USER_ID);
  for (const id of mentioned) interested.delete(id);
  for (const id of interested) deliver(data, id, "comment", page);
}

/** 공유(W23) — 수신자마다 shared 알림 한 건. 합치지 않는다(멘션과 같은 규칙). 자신은 건너뛴다. */
export async function sharePage(pageId: string, userIds: string[], note?: string): Promise<number> {
  if (userIds.length === 0) throw new Error("받는 사람을 한 명 이상 고르세요");
  const trimmed = note?.trim() ?? "";
  if (trimmed.length > 300) throw new Error("메모는 300자를 넘을 수 없습니다");
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  // 초안은 작성자(와 관리자)만 본다 — 공유하면 받는 사람이 열 수 없는 문서의 제목이 알림으로 샌다
  if (page.status === "draft") throw new Error("초안은 공유할 수 없습니다. 게시한 뒤 공유하세요");
  const rows = (data.notifications ??= []);
  let delivered = 0;
  for (const userId of new Set(userIds)) {
    if (userId === CURRENT_USER_ID) continue;
    rows.push({
      id: `n${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId,
      type: "shared",
      pageId: page.id,
      spaceId: page.spaceId,
      pageTitle: page.title,
      actorId: CURRENT_USER_ID,
      createdAt: new Date().toISOString(),
      read: false,
      note: trimmed || null,
    });
    delivered++;
  }
  persist();
  return delivered;
}

export async function listNotifications(options: { signal?: AbortSignal } = {}): Promise<NotificationList> {
  // 백엔드 fetch와 같이 이미 끊긴 요청은 AbortError로 끝난다
  if (options.signal?.aborted) throw new DOMException("요청이 취소되었습니다", "AbortError");
  const rows = (load().notifications ?? [])
    .filter((n) => n.userId === CURRENT_USER_ID)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
  return {
    unreadCount: rows.filter((n) => !n.read).length,
    items: rows.map((n) => ({ ...n })),
  };
}

/* ── 알림 설정(W23) — 목업은 발송 구성이 없다(emailConfigured=false). 스위치만 저장한다. */

const DEFAULT_PREFS: NotificationPrefsPatch = {
  emailEnabled: true, emailMode: "IMMEDIATE", mentioned: true, pageUpdated: true, comment: true, shared: true,
};

function prefsView(data: WikiData): NotificationPrefs {
  // 이 필드 도입 이전 저장분은 emailMode가 없다 — 기본값으로 채운다
  const saved = { ...DEFAULT_PREFS, ...(data.notificationPrefs?.[CURRENT_USER_ID] ?? {}) };
  return { ...saved, emailConfigured: false, email: null };
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  return prefsView(load());
}

export async function updateNotificationPrefs(patch: NotificationPrefsPatch): Promise<NotificationPrefs> {
  const data = load();
  (data.notificationPrefs ??= {})[CURRENT_USER_ID] = { ...patch };
  persist();
  return prefsView(data);
}

/** ids가 비면 전체 읽음. */
export async function markNotificationsRead(ids: string[] = []): Promise<void> {
  const data = load();
  for (const n of data.notifications ?? []) {
    if (n.userId !== CURRENT_USER_ID) continue;
    if (ids.length === 0 || ids.includes(n.id)) n.read = true;
  }
  persist();
}

export async function getWatchState(pageId: string): Promise<boolean> {
  const data = load();
  return (data.watches?.[pageId] ?? []).includes(CURRENT_USER_ID);
}

export async function setWatchState(pageId: string, watching: boolean): Promise<boolean> {
  const data = load();
  if (!data.pages.some((p) => p.id === pageId)) throw new Error("페이지를 찾을 수 없습니다");
  data.watches ??= {};
  const current = new Set(data.watches[pageId] ?? []);
  if (watching) current.add(CURRENT_USER_ID);
  else current.delete(CURRENT_USER_ID);
  data.watches[pageId] = [...current];
  persist();
  return watching;
}

/* ── 스페이스 구독(W27-4) ─────────────────────────────────── */

export async function getSpaceWatchState(spaceId: string): Promise<boolean> {
  const data = load();
  return (data.spaceWatches?.[spaceId] ?? []).includes(CURRENT_USER_ID);
}

export async function setSpaceWatchState(spaceId: string, watching: boolean): Promise<boolean> {
  const data = load();
  if (!data.spaces.some((s) => s.id === spaceId)) throw new Error("스페이스를 찾을 수 없습니다");
  data.spaceWatches ??= {};
  const current = new Set(data.spaceWatches[spaceId] ?? []);
  if (watching) current.add(CURRENT_USER_ID);
  else current.delete(CURRENT_USER_ID);
  data.spaceWatches[spaceId] = [...current];
  persist();
  return watching;
}

/* ── 소유자·검증(W27-5) ───────────────────────────────────── */
