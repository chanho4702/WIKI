// 듀얼모드 목업 백엔드 — localStorage(wiki.v1) 기반. VITE_API_BASE 미설정 시 wikiStore가 이 모듈을 사용한다.
import { MoveImpactError, PageConflictError } from "./types";
import type {
  Attachment,
  CollaborationDraftCommit,
  CollaborationDraftCommitOptions,
  Comment,
  DeletePageOptions,
  NotificationList,
  NotificationType,
  PageRestrictions,
  RestrictionPrincipal,
  Team,
  Page,
  PageStatus,
  PageType,
  PageVersion,
  SearchContentInput,
  SearchHit,
  SearchResults,
  Space,
  UpdatePageOptions,
  User,
  WikiData,
  TrashItem,
  TrashEntry,
  PageRestoreResult,
  LabelCount,
  CommentAnchor,
  PageNode,
} from "./types";
import { CURRENT_USER_ID } from "../../../mock/users";
import { createSeedData } from "../../../mock/seed";
import { WIKI_LINK_SOURCE } from "../lib/wikiLinks";

const STORAGE_KEY = "wiki.v1";

let cache: WikiData | null = null;

/** localStorage에서 읽은 값이 WikiData 형태인지 검증 — 5개 배열 필드가 전부 있어야 한다 */
function isWikiData(value: unknown): value is WikiData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (["users", "spaces", "pages", "versions", "comments"] as const).every((key) =>
    Array.isArray(record[key]),
  );
}

/** 구버전 데이터 호환: W4에서 추가된 코멘트 필드(parentId/updatedAt)를 null로 채운다 */
function normalize(data: WikiData): WikiData {
  for (const comment of data.comments) {
    comment.parentId ??= null;
    comment.updatedAt ??= null;
  }
  // type/status 도입(2026-07-26) 이전에 저장된 문서 — 전부 게시된 일반 페이지였다.
  for (const page of data.pages) {
    page.type ??= "page";
    page.status ??= "published";
  }
  // 구독 도입(W21-4) 이전 데이터 백필 — 그때까지 암묵적으로 알림을 받던 사람(작성자 + 버전을
  // 남긴 사람)을 구독자로 옮긴다. 백엔드 V15 백필과 같은 규칙이다. 이 단계가 없으면 기존
  // 문서의 알림이 조용히 끊긴다.
  if (data.watches === undefined) {
    const watches: Record<string, string[]> = {};
    for (const page of data.pages) watches[page.id] = [page.createdBy];
    for (const version of data.versions) {
      const current = watches[version.pageId];
      if (current && !current.includes(version.savedBy)) current.push(version.savedBy);
    }
    data.watches = watches;
  }
  return data;
}

function load(): WikiData {
  if (cache) return cache;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isWikiData(parsed)) cache = normalize(parsed);
      // 형태가 다르면 cache가 null로 남아 아래에서 시드로 재생성된다
    } catch {
      // 손상된 JSON — 시드로 재생성
    }
  }
  if (!cache) {
    // 시드도 normalize를 태운다 — 구독 백필(W21-4) 같은 파생 데이터가 시드에만 빠지면
    // "새 저장소에서만 알림이 안 온다"는 재현 어려운 차이가 생긴다.
    cache = normalize(createSeedData());
    persist();
  }
  return cache;
}

function persist(): void {
  if (cache) localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

/** 내부 상태 유출 방지 — 반환값은 항상 깊은 복사본 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

function nextId(): string {
  return crypto.randomUUID();
}

/** 테스트 전용: 메모리 캐시를 초기화한다 (localStorage는 건드리지 않음). */
export function __resetForTest(): void {
  cache = null;
}

// ── users ────────────────────────────────────────────────────

export async function listUsers(): Promise<User[]> {
  return clone(load().users);
}

export async function getCurrentUser(): Promise<User> {
  const user = load().users.find((u) => u.id === CURRENT_USER_ID);
  if (!user) throw new Error("현재 사용자를 찾을 수 없습니다");
  return clone(user);
}

// ── spaces ───────────────────────────────────────────────────

export async function listSpaces(): Promise<Space[]> {
  return clone(load().spaces);
}

export async function createSpace(input: { key: string; name: string }): Promise<Space> {
  const data = load();
  const key = input.key.trim().toUpperCase();
  const name = input.name.trim();
  if (!key) throw new Error("스페이스 키를 입력하세요");
  if (!name) throw new Error("스페이스 이름을 입력하세요");
  if (data.spaces.some((s) => s.key === key)) {
    throw new Error(`이미 존재하는 스페이스 키입니다: ${key}`);
  }
  const space: Space = { id: nextId(), key, name, createdAt: new Date().toISOString() };
  data.spaces.push(space);
  persist();
  return clone(space);
}

// ── pages ────────────────────────────────────────────────────

export async function listPages(spaceId: string): Promise<Page[]> {
  return clone(
    load()
      .pages.filter((p) => p.spaceId === spaceId)
      .sort((a, b) => a.position - b.position),
  );
}

export async function getPage(id: string): Promise<Page | null> {
  const page = load().pages.find((p) => p.id === id);
  return page ? clone(page) : null;
}

/** 버전 스냅샷 부수효과: 현재 페이지 내용을 version = max+1로 쌓는다 */
function snapshotVersion(data: WikiData, page: Page, at: string): void {
  const maxVersion = data.versions
    .filter((v) => v.pageId === page.id)
    .reduce((max, v) => Math.max(max, v.version), 0);
  const version = maxVersion + 1;
  page.version = version;
  data.versions.push({
    id: nextId(),
    pageId: page.id,
    version,
    title: page.title,
    body: page.body,
    savedBy: CURRENT_USER_ID,
    savedAt: at,
  });
}

export async function createPage(input: {
  spaceId: string;
  parentId?: string | null;
  title: string;
  body?: string;
  /** 생략 시 일반 페이지. 폴더는 body를 쓰지 않는다(P1 결정). */
  type?: PageType;
  /** 생략 시 게시됨. 사이드바 "+"로 만드는 임시 문서만 "draft"로 만든다(P3 결정). */
  status?: PageStatus;
}): Promise<Page> {
  const data = load();
  if (!data.spaces.some((s) => s.id === input.spaceId)) {
    throw new Error("스페이스를 찾을 수 없습니다");
  }
  const parentId = input.parentId ?? null;
  if (parentId !== null) {
    const parent = data.pages.find((p) => p.id === parentId);
    if (!parent) throw new Error("부모 페이지를 찾을 수 없습니다");
    if (parent.spaceId !== input.spaceId) {
      throw new Error("부모 페이지가 같은 스페이스에 없습니다");
    }
  }
  const title = input.title.trim();
  if (!title) throw new Error("페이지 제목을 입력하세요");
  const now = new Date().toISOString();
  // position = 형제(같은 스페이스·같은 부모) 내 max+1
  const maxPosition = data.pages
    .filter((p) => p.spaceId === input.spaceId && p.parentId === parentId)
    .reduce((max, p) => Math.max(max, p.position), 0);
  const page: Page = {
    id: nextId(),
    spaceId: input.spaceId,
    parentId,
    type: input.type ?? "page",
    // 폴더는 게시 개념이 없다 — status를 넘겨도 무시하고 항상 게시 상태로 둔다.
    status: input.type === "folder" ? "published" : (input.status ?? "published"),
    title,
    body: input.body ?? "",
    version: 1,
    position: maxPosition + 1,
    createdBy: CURRENT_USER_ID,
    updatedBy: CURRENT_USER_ID,
    createdAt: now,
    updatedAt: now,
  };
  data.pages.push(page);
  snapshotVersion(data, page, now); // v1 자동 스냅샷
  autoWatch(data, page.id, CURRENT_USER_ID); // 만든 문서는 자동 구독(W21-4)
  persist();
  return clone(page);
}

// ── versions ─────────────────────────────────────────────────

export async function listVersions(pageId: string): Promise<PageVersion[]> {
  return clone(
    load()
      .versions.filter((v) => v.pageId === pageId)
      .sort((a, b) => b.version - a.version), // 최신 먼저
  );
}

export async function updatePage(
  id: string,
  patch: { title?: string; body?: string },
  options: UpdatePageOptions = {},
): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  if (options.expectedVersion !== undefined && options.expectedVersion !== page.version) {
    throw new PageConflictError(clone(page));
  }
  const nextTitle = patch.title !== undefined ? patch.title.trim() : page.title;
  if (!nextTitle) throw new Error("페이지 제목을 입력하세요");
  const nextBody = patch.body !== undefined ? patch.body : page.body;
  // 둘 다 무변경이면 no-op — 버전·updatedBy/updatedAt 불변
  if (nextTitle === page.title && nextBody === page.body) {
    return clone(page);
  }
  const oldBody = page.body;
  page.title = nextTitle;
  page.body = nextBody;
  page.updatedBy = CURRENT_USER_ID;
  page.updatedAt = new Date().toISOString();
  snapshotVersion(data, page, page.updatedAt); // 적용 후 내용을 새 버전(max+1)으로
  autoWatch(data, page.id, CURRENT_USER_ID); // 고친 문서는 자동 구독(W21-4)
  notifyPageUpdated(data, page, oldBody, nextBody);
  persist();
  return clone(page);
}

/**
 * 페이지 이모지 아이콘 설정/해제(null) — 이동(movePage)과 같은 메타데이터 변경 취급이다:
 * 내용이 안 바뀌므로 버전 스냅샷을 쌓지 않고 updatedAt도 건드리지 않는다.
 */
export async function setPageIcon(id: string, icon: string | null): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  page.icon = icon;
  persist();
  return clone(page);
}

/**
 * 조회 1회 기록 — 페이지 보기 화면 진입 시 호출한다. 누적 조회수를 돌려준다.
 * 컨플루언스처럼 정교한 중복 제거(사용자별 유니크)는 백엔드 몫 — 목업은 단순 누적.
 */
export async function recordPageView(id: string): Promise<number> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  page.views = (page.views ?? 0) + 1;
  persist();
  return page.views;
}

/* ── 페이지 제한 (W18) — 목업은 저장·상속 표시만 담당한다(단일 사용자라 강제 판정은
 * 백엔드 모드의 몫). 자물쇠 다이얼로그 기능 검증용. ────────────────────── */

/** 목업 팀 디렉터리 — org-service teams의 자리. UI(주체 선택)를 검증할 최소 데이터. */
export async function listTeams(): Promise<Team[]> {
  return [
    { id: "t1", name: "플랫폼팀" },
    { id: "t2", name: "디자인팀" },
  ];
}

export async function getPageRestrictions(pageId: string): Promise<PageRestrictions> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  const own = data.restrictions?.[pageId];
  const inherited: PageRestrictions["inherited"] = [];
  const visited = new Set<string>([pageId]);
  let cursor = page.parentId;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const ancestor = data.pages.find((p) => p.id === cursor);
    if (!ancestor) break;
    const rows = data.restrictions?.[ancestor.id];
    if (rows && rows.view.length > 0) {
      inherited.push({ pageId: ancestor.id, pageTitle: ancestor.title, principals: clone(rows.view) });
    }
    cursor = ancestor.parentId;
  }
  return { view: clone(own?.view ?? []), edit: clone(own?.edit ?? []), inherited };
}

/** 전체 교체 — 둘 다 비우면 항목 자체를 지운다(기본값 = 키 부재). */
export async function setPageRestrictions(
  pageId: string,
  input: { view: RestrictionPrincipal[]; edit: RestrictionPrincipal[] },
): Promise<PageRestrictions> {
  const data = load();
  if (!data.pages.some((p) => p.id === pageId)) throw new Error("페이지를 찾을 수 없습니다");
  data.restrictions ??= {};
  if (input.view.length === 0 && input.edit.length === 0) {
    delete data.restrictions[pageId];
  } else {
    data.restrictions[pageId] = { view: clone(input.view), edit: clone(input.edit) };
  }
  persist();
  return getPageRestrictions(pageId);
}

/* ── 알림 (백엔드 V11과 같은 규칙 — NotificationService 참조) ─────────────
 * 트리거: 새 멘션(MENTIONED) / 관심 사용자(작성자+버전 편집자+본문 멘션)의 페이지
 * 업데이트·댓글. 행위자 자신 제외, 같은 (수신자,페이지,타입) 미읽음은 1건으로 합침. */

const MENTION_RE = /\]\(user:([\w-]+)\)/g;

function mentionIdsOf(body: string | undefined): Set<string> {
  const ids = new Set<string>();
  for (const m of (body ?? "").matchAll(MENTION_RE)) ids.add(m[1]);
  return ids;
}

/**
 * 알림 대상 = 구독자(W21-4) + 멘션된 사용자. 백엔드와 같은 규칙이다.
 * 전에는 "작성자 + 버전을 남긴 사람"을 계산했는데 그러면 끌 수가 없었다.
 */
function interestedIn(data: WikiData, page: Page, mentions: Set<string>): Set<string> {
  const users = new Set(mentions);
  for (const watcher of data.watches?.[page.id] ?? []) users.add(watcher);
  return users;
}

/** 만들거나 고치거나 댓글을 단 문서는 자동 구독한다(컨플루언스와 같은 기본 동작). */
function autoWatch(data: WikiData, pageId: string, userId: string): void {
  data.watches ??= {};
  const current = new Set(data.watches[pageId] ?? []);
  current.add(userId);
  data.watches[pageId] = [...current];
}

function deliver(data: WikiData, userId: string, type: NotificationType, page: Page) {
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

function notifyPageUpdated(data: WikiData, page: Page, oldBody: string, newBody: string) {
  const before = mentionIdsOf(oldBody);
  const now = mentionIdsOf(newBody);
  const newlyMentioned = [...now].filter((id) => !before.has(id) && id !== CURRENT_USER_ID);
  for (const id of newlyMentioned) deliver(data, id, "mentioned", page);
  const interested = interestedIn(data, page, now);
  interested.delete(CURRENT_USER_ID);
  for (const id of newlyMentioned) interested.delete(id);
  for (const id of interested) deliver(data, id, "page_updated", page);
}

function notifyCommentAdded(data: WikiData, page: Page, commentBody: string): void {
  const mentioned = [...mentionIdsOf(commentBody)].filter((id) => id !== CURRENT_USER_ID);
  for (const id of mentioned) deliver(data, id, "mentioned", page);
  const interested = interestedIn(data, page, mentionIdsOf(page.body));
  interested.delete(CURRENT_USER_ID);
  for (const id of mentioned) interested.delete(id);
  for (const id of interested) deliver(data, id, "comment", page);
}

export async function listNotifications(): Promise<NotificationList> {
  const rows = (load().notifications ?? [])
    .filter((n) => n.userId === CURRENT_USER_ID)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
  return {
    unreadCount: rows.filter((n) => !n.read).length,
    items: rows.map((n) => ({ ...n })),
  };
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

export async function commitCollaborationDraft(
  id: string,
  patch: { title: string; body: string },
  options: CollaborationDraftCommitOptions,
): Promise<CollaborationDraftCommit> {
  return {
    page: await updatePage(id, patch, { expectedVersion: options.expectedVersion }),
    generation: options.expectedGeneration + 1,
  };
}

/**
 * 초안을 게시한다. 이미 게시된 문서면 no-op(버전·updatedAt 불변) — updatePage의 무변경 no-op과
 * 같은 규칙이다. 게시는 "내용 변경"이 아니므로 버전 스냅샷을 쌓지 않는다(movePage와 같은 취급).
 */
export async function publishPage(id: string): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  if (page.status === "published") return clone(page);
  if (!page.title.trim()) throw new Error("제목을 입력해야 게시할 수 있습니다");
  page.status = "published";
  persist();
  return clone(page);
}

/**
 * 단일 페이지 복제 — 백엔드 v1 계약과 동일한 범위: 하위·댓글 미복사, 제목 "(사본)",
 * 부모·타입·상태 유지, 형제 맨 뒤. (목업엔 첨부 저장이 없어 첨부 복사는 해당 없음.)
 */
export async function copyPage(id: string): Promise<Page> {
  const data = load();
  const source = data.pages.find((p) => p.id === id);
  if (!source) throw new Error("페이지를 찾을 수 없습니다");
  const siblings = data.pages.filter(
    (p) => p.spaceId === source.spaceId && p.parentId === source.parentId,
  );
  const now = new Date().toISOString();
  const copy: Page = {
    ...clone(source),
    id: nextId(),
    title: `${source.title} (사본)`,
    position: Math.max(0, ...siblings.map((p) => p.position)) + 1,
    version: 1,
    createdBy: CURRENT_USER_ID,
    updatedBy: CURRENT_USER_ID,
    createdAt: now,
    updatedAt: now,
  };
  data.pages.push(copy);
  persist();
  return clone(copy);
}

export async function deletePage(id: string, options?: DeletePageOptions): Promise<void> {
  const data = load();
  const index = data.pages.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("페이지를 찾을 수 없습니다");
  const target = data.pages[index];
  const hasChildren = data.pages.some((p) => p.parentId === id);
  // 옵션이 없으면 기존 계약 그대로 거부한다 — 자식을 어떻게 할지는 호출측이 명시할 때만 정해진다.
  if (hasChildren && !options?.children) {
    throw new Error("하위 페이지가 있어 삭제할 수 없습니다");
  }

  // 지울 대상 집합: promote면 자기 자신만, cascade면 후손 전부.
  // visited: 손상 데이터(parentId 순환)에서도 무한 루프하지 않는다 (movePage 순환 가드와 같은 방어)
  const doomed = new Set<string>([id]);
  if (hasChildren && options?.children === "cascade") {
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of data.pages) {
        if (child.parentId === current && !doomed.has(child.id)) {
          doomed.add(child.id);
          queue.push(child.id);
        }
      }
    }
  }

  if (hasChildren && options?.children === "promote") {
    // 자식을 삭제 대상의 부모로 올린다. 대상이 있던 자리(position)를 이어받게 해
    // 트리에서 보이던 위치가 유지되게 한다 — 승격이 곧 순서 뒤섞임이 되면 안 된다.
    const promoted = data.pages
      .filter((p) => p.parentId === id)
      .sort((a, b) => a.position - b.position);
    const siblings = data.pages
      .filter(
        (p) =>
          p.spaceId === target.spaceId && p.parentId === target.parentId && !doomed.has(p.id),
      )
      .sort((a, b) => a.position - b.position);
    const insertAt = siblings.filter((p) => p.position < target.position).length;
    siblings.splice(insertAt, 0, ...promoted);
    promoted.forEach((p) => {
      p.parentId = target.parentId;
    });
    siblings.forEach((p, i) => {
      p.position = i + 1; // 형제 내 1..n 연속 재부여
    });
  }

  // W21-1: 지우지 않고 휴지통으로 옮긴다. 버전·댓글도 함께 보관해야 복원이 원래 상태를 되돌린다.
  const deletedAt = new Date().toISOString();
  data.trash ??= [];
  for (const doomedId of doomed) {
    const page = data.pages.find((p) => p.id === doomedId);
    if (!page) continue;
    data.trash.push({
      page: clone(page),
      deletedAt,
      deletedBy: CURRENT_USER_ID,
      root: doomedId === id,
      versions: data.versions.filter((v) => v.pageId === doomedId).map(clone),
      comments: data.comments.filter((c) => c.pageId === doomedId).map(clone),
    });
  }
  data.pages = data.pages.filter((p) => !doomed.has(p.id));
  data.versions = data.versions.filter((v) => !doomed.has(v.pageId));
  data.comments = data.comments.filter((c) => !doomed.has(c.pageId));
  persist();
}

/* ── 지연 트리(2026-08-28) ───────────────────────────────── */

/**
 * 목업은 전체 배열을 갖고 있지만, 백엔드와 **같은 모양·같은 상한**으로만 응답한다.
 * 목업이 더 많이 주면 화면이 목업에서만 동작하고 백엔드 모드에서 조용히 깨진다.
 */
const TREE_SEARCH_LIMIT = 50;
const TREE_LOOKUP_LIMIT = 200;

function toNode(data: WikiData, page: Page): PageNode {
  return {
    id: page.id,
    parentId: page.parentId,
    title: page.title,
    type: page.type,
    status: page.status,
    position: page.position,
    icon: page.icon ?? null,
    updatedBy: page.updatedBy,
    updatedAt: page.updatedAt,
    childCount: data.pages.filter((p) => p.parentId === page.id).length,
  };
}

/** 직계 자식만(parentId 생략/null = 루트). */
export async function listChildren(
  spaceId: string,
  parentId: string | null = null,
): Promise<PageNode[]> {
  const data = load();
  return data.pages
    .filter((p) => p.spaceId === spaceId && p.parentId === parentId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((p) => toNode(data, p));
}

/** 루트→부모 순서(자기 자신 제외). 순환 데이터에서도 멈춘다. */
export async function listAncestors(pageId: string): Promise<PageNode[]> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  const chain: Page[] = [];
  const visited = new Set([pageId]);
  let cursor = page.parentId;
  while (cursor !== null && !visited.has(cursor)) {
    visited.add(cursor);
    const parent = data.pages.find((p) => p.id === cursor);
    if (!parent) break;
    chain.unshift(parent);
    cursor = parent.parentId;
  }
  return chain.map((p) => toNode(data, p));
}

/** 후손 전체(자기 자신 제외) — 내보내기·삭제 영향 표시가 쓴다. */
export async function listDescendants(pageId: string): Promise<PageNode[]> {
  const data = load();
  const found: Page[] = [];
  const visited = new Set([pageId]);
  const queue = [pageId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of data.pages.filter((p) => p.parentId === current)) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      found.push(child);
      queue.push(child.id);
    }
  }
  return found.map((p) => toNode(data, p));
}

/** 제목 정확 일치 — `[[제목]]` 해석. 렌더러와 같은 기준(trim + 소문자, 같은 스페이스). */
export async function lookupPagesByTitle(spaceId: string, titles: string[]): Promise<PageNode[]> {
  const data = load();
  const wanted = new Set(
    titles
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
      .slice(0, TREE_LOOKUP_LIMIT),
  );
  if (wanted.size === 0) return [];
  return data.pages
    .filter((p) => p.spaceId === spaceId && wanted.has(p.title.trim().toLowerCase()))
    .map((p) => toNode(data, p));
}

/** id 묶음 조회 — 별표 목록처럼 "아는 id들의 현재 제목"이 필요한 곳이 쓴다. */
export async function listPagesByIds(spaceId: string, ids: string[]): Promise<PageNode[]> {
  const data = load();
  const wanted = new Set(ids.slice(0, TREE_LOOKUP_LIMIT));
  return data.pages
    .filter((p) => p.spaceId === spaceId && wanted.has(p.id))
    .map((p) => toNode(data, p));
}

/** 제목 부분 일치 — 사이드바 필터와 `[[` 자동완성. */
export async function searchPageTitles(spaceId: string, query: string): Promise<PageNode[]> {
  const data = load();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return data.pages
    .filter((p) => p.spaceId === spaceId && p.title.toLowerCase().includes(q))
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
    .slice(0, TREE_SEARCH_LIMIT)
    .map((p) => toNode(data, p));
}

/* ── 라벨·백링크(W21-2) ──────────────────────────────────── */

/** 백엔드 PageLabel.normalize와 같은 규칙 — 앞뒤 공백 제거 + 소문자 + 내부 공백은 하이픈. */
export function normalizeLabel(raw: string): string {
  const value = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (!value) throw new Error("라벨을 입력하세요");
  if (value.length > 64) throw new Error("라벨은 64자를 넘을 수 없습니다");
  return value;
}

export async function listLabels(pageId: string): Promise<string[]> {
  // 코드유닛 정렬(기본 sort) — 백엔드의 SQL `order by name`과 같은 기준을 쓴다.
  // localeCompare는 한글을 라틴 앞에 놓아 목업/백엔드 모드의 칩 순서가 갈린다.
  const data = load();
  return [...(data.labels?.[pageId] ?? [])].sort();
}

/** 전량 교체 — 화면이 최종 상태를 보낸다(백엔드 PUT /labels와 같은 계약). */
export async function setLabels(pageId: string, raw: string[]): Promise<string[]> {
  const data = load();
  if (!data.pages.some((p) => p.id === pageId)) throw new Error("페이지를 찾을 수 없습니다");
  const names = [...new Set(raw.map(normalizeLabel))];
  if (names.length > 30) throw new Error("라벨은 페이지당 30개까지입니다");
  data.labels ??= {};
  if (names.length === 0) delete data.labels[pageId];
  else data.labels[pageId] = names;
  persist();
  return [...names].sort();
}

export async function listSpaceLabels(spaceId: string): Promise<LabelCount[]> {
  const data = load();
  const counts = new Map<string, number>();
  for (const page of data.pages.filter((p) => p.spaceId === spaceId)) {
    for (const name of data.labels?.[page.id] ?? []) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
}

export async function listPagesWithLabel(spaceId: string, name: string): Promise<Page[]> {
  const data = load();
  const target = normalizeLabel(name);
  return data.pages
    .filter((p) => p.spaceId === spaceId && (data.labels?.[p.id] ?? []).includes(target))
    .map(clone);
}

/**
 * 백링크 — 같은 스페이스에서 이 페이지 제목을 `[[ ]]`로 가리키는 문서.
 * 목업은 저장된 그래프 없이 본문에서 매번 뽑는다: 본문의 파생물이라 계산이 곧 정본이고,
 * 백엔드의 "저장 시 재색인"과 결과가 같다.
 */
export async function listBacklinks(pageId: string): Promise<Page[]> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  const title = page.title.trim().toLowerCase();
  return data.pages
    .filter((p) => p.spaceId === page.spaceId && p.id !== pageId)
    .filter((p) => extractLinkTargets(p.body).has(title))
    .sort((a, b) => (a.title < b.title ? -1 : 1))
    .map(clone);
}

/** 코드 펜스·인라인 코드를 지운 뒤 `[[제목]]`을 모은다 — 렌더러와 같은 규칙. */
export function extractLinkTargets(markdown: string): Set<string> {
  const stripped = markdown.replace(new RegExp("```[\\s\\S]*?```|`[^`\\n]*`", "g"), " ");
  const found = new Set<string>();
  for (const match of stripped.matchAll(new RegExp(WIKI_LINK_SOURCE, "g"))) {
    const title = match[1].trim().toLowerCase();
    if (title) found.add(title);
  }
  return found;
}

/* ── 휴지통(W21-1) ───────────────────────────────────────── */

/** 루트 항목만 행으로. 하위는 개수로 센다 — 백엔드 TrashService.list와 같은 규칙. */
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

export async function movePage(
  id: string,
  target: {
    parentId: string | null;
    beforeId?: string | null;
    /** 다른 스페이스로 이동(생략 = 현재 스페이스). 백엔드 move 계약과 동일 의미론. */
    spaceId?: string;
    /** 스페이스 간 이동 시 하위 처리 — "with"(기본): 서브트리 동반 / "promote": 원래 부모 밑에 남김 */
    children?: "with" | "promote";
    /** 이동 영향(새로 적용되는 보기 제한) 확인 완료 표시 — 없으면 영향 발견 시 MoveImpactError. */
    confirmImpact?: boolean;
  },
): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  const targetSpaceId = target.spaceId ?? page.spaceId;
  // W18 이동 영향 — 백엔드와 같은 규칙: 새 조상 체인의 VIEW 제한 중 현 체인에 없던 것
  if (!target.confirmImpact
      && (targetSpaceId !== page.spaceId || page.parentId !== (target.parentId ?? null))) {
    const restrictedChain = (startId: string | null): Map<string, RestrictionPrincipal[]> => {
      const found = new Map<string, RestrictionPrincipal[]>();
      const visited = new Set<string>();
      let cursor = startId;
      while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        const rows = data.restrictions?.[cursor];
        if (rows && rows.view.length > 0) found.set(cursor, rows.view);
        cursor = data.pages.find((p) => p.id === cursor)?.parentId ?? null;
      }
      return found;
    };
    const current = restrictedChain(page.parentId);
    const next = restrictedChain(target.parentId ?? null);
    const newly = [...next.entries()].filter(([pid]) => !current.has(pid));
    if (newly.length > 0) {
      throw new MoveImpactError(
        "이동하면 새 위치의 보기 제한이 적용되어 일부 사용자가 접근을 잃습니다. 확인 후 다시 시도하세요",
        newly.map(([pid, principals]) => ({
          pageId: pid,
          pageTitle: data.pages.find((p) => p.id === pid)?.title ?? "",
          principals: clone(principals),
        })),
      );
    }
  }
  if (targetSpaceId !== page.spaceId) {
    if (!data.spaces.some((s) => s.id === targetSpaceId)) {
      throw new Error("스페이스를 찾을 수 없습니다");
    }
    const sourceParentId = page.parentId;
    if (target.children === "promote") {
      // 직계 하위를 원래 부모 밑으로 올리고 이 페이지만 옮긴다
      for (const child of data.pages) {
        if (child.parentId === page.id) child.parentId = sourceParentId;
      }
    } else {
      // 서브트리 동반 — 구조 유지, spaceId만 변경 (visited: 순환 데이터 방어)
      const queue = [page.id];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const child of data.pages) {
          if (child.parentId === cur) {
            child.spaceId = targetSpaceId;
            queue.push(child.id);
          }
        }
      }
    }
    page.spaceId = targetSpaceId;
  }
  const parentId = target.parentId;
  if (parentId !== null) {
    const parent = data.pages.find((p) => p.id === parentId);
    if (!parent) throw new Error("부모 페이지를 찾을 수 없습니다");
    if (parent.spaceId !== page.spaceId) {
      throw new Error("부모 페이지가 같은 스페이스에 없습니다");
    }
    // 순환 금지: 새 부모에서 루트까지 올라가는 경로에 자신이 있으면 자손 밑 이동이다
    // visited: 손상된 데이터(parentId 순환)에서도 무한 루프하지 않는다 (PageViewPage ancestorsOf와 동일 방어)
    let cursor: Page | undefined = parent;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor.id === page.id) {
        throw new Error("페이지를 자신의 하위로 이동할 수 없습니다");
      }
      if (visited.has(cursor.id)) break;
      visited.add(cursor.id);
      const nextId: string | null = cursor.parentId;
      cursor = nextId === null ? undefined : data.pages.find((p) => p.id === nextId);
    }
  }
  // 대상 형제 집합(자신 제외)에 삽입 위치를 정하고 position을 1..n으로 재부여
  const siblings = data.pages
    .filter((p) => p.spaceId === page.spaceId && p.parentId === parentId && p.id !== page.id)
    .sort((a, b) => a.position - b.position);
  const beforeId = target.beforeId ?? null;
  let insertAt = siblings.length;
  if (beforeId !== null) {
    const index = siblings.findIndex((p) => p.id === beforeId);
    if (index === -1) throw new Error("기준 페이지가 대상 위치에 없습니다");
    insertAt = index;
  }
  siblings.splice(insertAt, 0, page);
  page.parentId = parentId;
  siblings.forEach((p, i) => {
    p.position = i + 1;
  });
  // 이동은 내용 변경이 아니다 — 버전 스냅샷 없음, updatedBy/updatedAt 불변
  persist();
  return clone(page);
}

export async function restoreVersion(pageId: string, versionId: string): Promise<Page> {
  const data = load();
  const version = data.versions.find((v) => v.id === versionId && v.pageId === pageId);
  if (!version) throw new Error("버전을 찾을 수 없습니다");
  // updatePage 경로 재사용 → 복원도 새 버전으로 쌓인다 (히스토리 안 끊김)
  return updatePage(pageId, { title: version.title, body: version.body });
}

// ── comments ─────────────────────────────────────────────────

export async function listComments(pageId: string): Promise<Comment[]> {
  return clone(
    load()
      .comments.filter((c) => c.pageId === pageId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export async function addComment(
  pageId: string,
  body: string,
  parentId?: string | null,
  anchor?: CommentAnchor | null,
): Promise<Comment> {
  const data = load();
  if (!data.pages.some((p) => p.id === pageId)) {
    throw new Error("페이지를 찾을 수 없습니다");
  }
  const resolvedParentId = parentId ?? null;
  if (resolvedParentId !== null) {
    const parent = data.comments.find((c) => c.id === resolvedParentId);
    if (!parent) throw new Error("부모 코멘트를 찾을 수 없습니다");
    if (parent.pageId !== pageId) throw new Error("부모 코멘트가 같은 페이지에 없습니다");
    if (parent.parentId !== null) throw new Error("답글에는 답글을 달 수 없습니다");
  }
  const trimmed = body.trim();
  if (!trimmed) throw new Error("코멘트 내용을 입력하세요");
  if (anchor && resolvedParentId !== null) {
    throw new Error("답글에는 본문 구간을 붙일 수 없습니다");
  }
  if (anchor && anchor.occurrence < 0) {
    throw new Error("본문 구간 위치가 올바르지 않습니다");
  }
  const comment: Comment = {
    id: nextId(),
    pageId,
    authorId: CURRENT_USER_ID,
    body: trimmed,
    parentId: resolvedParentId,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    anchorType: anchor ? "inline" : "page",
    anchorQuote: anchor ? anchor.quote : null,
    anchorOccurrence: anchor ? anchor.occurrence : null,
    resolvedAt: null,
  };
  data.comments.push(comment);
  autoWatch(data, pageId, CURRENT_USER_ID); // 댓글을 달면 그 대화에 참여한 것이다(W21-4)
  const page = data.pages.find((p) => p.id === pageId);
  if (page) notifyCommentAdded(data, page, trimmed);
  persist();
  return clone(comment);
}

/** 해결/재개(W21-4) — 인라인 스레드만 대상. 본인이 아니어도 닫을 수 있다(컨플루언스 규칙). */
export async function setCommentResolved(id: string, resolved: boolean): Promise<Comment> {
  const data = load();
  const comment = data.comments.find((c) => c.id === id);
  if (!comment) throw new Error("코멘트를 찾을 수 없습니다");
  if (comment.anchorType !== "inline") throw new Error("인라인 댓글만 해결할 수 있습니다");
  comment.resolvedAt = resolved ? new Date().toISOString() : null;
  persist();
  return clone(comment);
}

/* ── 구독(W21-4) ─────────────────────────────────────────── */

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

export async function updateComment(id: string, body: string): Promise<Comment> {
  const data = load();
  const comment = data.comments.find((c) => c.id === id);
  if (!comment) throw new Error("코멘트를 찾을 수 없습니다");
  if (comment.authorId !== CURRENT_USER_ID) {
    throw new Error("본인의 코멘트만 수정할 수 있습니다");
  }
  const trimmed = body.trim();
  if (!trimmed) throw new Error("코멘트 내용을 입력하세요");
  if (trimmed === comment.body) return clone(comment); // 무변경 no-op
  comment.body = trimmed;
  comment.updatedAt = new Date().toISOString();
  persist();
  return clone(comment);
}

// ── attachments (목업 미지원) ────────────────────────────────
// 백엔드 신규 capability — 목업 모드(localStorage)는 파일 저장을 지원하지 않는다.

export async function listAttachments(_pageId: string): Promise<Attachment[]> {
  return [];
}

export async function uploadAttachment(
  _pageId: string,
  _file: File,
  _options?: import("./types").AttachmentUploadOptions,
): Promise<Attachment> {
  throw new Error("목업 모드에서는 첨부를 지원하지 않습니다");
}

export async function requestCollaborationTicket(
  _pageId: string,
): Promise<import("./types").CollaborationTicket> {
  throw new Error("목업 모드에서는 공동 편집을 지원하지 않습니다");
}

export async function bootstrapCollaborationDocument(
  _pageId: string,
  _basePageVersion: number,
  _ticket: string,
  _state: Uint8Array,
): Promise<import("./types").CollaborationBootstrap> {
  throw new Error("목업 모드에서는 공동 편집을 지원하지 않습니다");
}

export async function confirmAttachments(_pageId: string, _attachmentIds: string[]): Promise<void> {
  // 목업 모드는 첨부 자체를 지원하지 않는다.
}

export function attachmentUrl(_id: string): string {
  return "";
}

export function inlineAttachmentUrl(id: string): string {
  return `/api/wiki/attachments/${id}/inline`;
}

export function attachmentIdFromInlineUrl(src: string): string | null {
  return /^\/api\/wiki\/attachments\/(\d+)\/inline$/.exec(src)?.[1] ?? null;
}

export async function fetchInlineAttachment(_id: string, _signal?: AbortSignal): Promise<Blob> {
  throw new Error("목업 모드에서는 첨부를 지원하지 않습니다");
}

export async function deleteAttachment(_id: string): Promise<void> {
  // no-op
}

function highlightSnippet(text: string, query: string): string | null {
  const index = text.toLocaleLowerCase("ko-KR").indexOf(query.toLocaleLowerCase("ko-KR"));
  if (index < 0) return null;
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + query.length + 100);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, index)}<em>${text.slice(index, index + query.length)}</em>${text.slice(index + query.length, end)}${suffix}`;
}

/** 목업 모드도 화면과 같은 검색 계약을 제공한다. 첨부파일은 목업 스토리지가 없어 PAGE만 검색한다. */
export async function searchContent(input: SearchContentInput): Promise<SearchResults> {
  const query = input.query.trim();
  if (!query) return { total: 0, totalExact: true, tookMs: 0, hits: [] };

  const data = load();
  const spaces = new Map(data.spaces.map((space) => [space.id, space]));
  const allowedSpaces = input.spaceIds ? new Set(input.spaceIds) : null;
  const pagesRequested = !input.docTypes || input.docTypes.length === 0 || input.docTypes.includes("PAGE");
  const pageHits: SearchHit[] = !pagesRequested
    ? []
    : data.pages.flatMap((page): SearchHit[] => {
        if (page.status === "draft" || (allowedSpaces && !allowedSpaces.has(page.spaceId))) return [];
        const space = spaces.get(page.spaceId);
        if (!space) return [];
        const titleHighlight = highlightSnippet(page.title, query);
        const bodyHighlight = page.type === "page" ? highlightSnippet(page.body, query) : null;
        if (!titleHighlight && !bodyHighlight) return [];
        return [{
          id: page.id,
          docType: "PAGE",
          spaceId: page.spaceId,
          spaceKey: space.key,
          spaceName: space.name,
          pageId: null,
          pageType: page.type === "folder" ? "FOLDER" : "PAGE",
          title: page.title,
          filename: null,
          highlights: [titleHighlight, bodyHighlight].filter((value): value is string => value !== null),
          updatedAt: page.updatedAt,
          score: (titleHighlight ? 3 : 0) + (bodyHighlight ? 1 : 0),
        }];
      });

  pageHits.sort((a, b) => b.score - a.score || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const page = Math.max(input.page ?? 0, 0);
  const size = Math.max(0, Math.min(input.size ?? 20, 100));
  return {
    total: pageHits.length,
    totalExact: true,
    tookMs: 0,
    hits: pageHits.slice(page * size, (page + 1) * size),
  };
}

export async function deleteComment(id: string): Promise<void> {
  const data = load();
  const comment = data.comments.find((c) => c.id === id);
  if (!comment) throw new Error("코멘트를 찾을 수 없습니다");
  if (comment.authorId !== CURRENT_USER_ID) {
    throw new Error("본인의 코멘트만 삭제할 수 있습니다");
  }
  // 최상위 코멘트면 그 답글도 연쇄 삭제
  data.comments = data.comments.filter((c) => c.id !== id && c.parentId !== id);
  persist();
}
