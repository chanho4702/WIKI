// 듀얼모드 목업 백엔드 — localStorage(wiki.v1) 기반. VITE_API_BASE 미설정 시 wikiStore가 이 모듈을 사용한다.
import { MoveImpactError, PageConflictError, REACTION_EMOJIS } from "./types";
import { parseTasks, toggleTaskLine, type ParsedTask } from "../lib/tasks";
import { defaultVerifiedUntil } from "../lib/verification";
import type {
  Attachment,
  CollaborationDraftCommit,
  CollaborationDraftCommitOptions,
  Comment,
  DeletePageOptions,
  AuditEntry,
  BlogPost,
  NotificationList,
  NotificationPrefs,
  NotificationPrefsPatch,
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
  CopyPageOptions,
  LabelCount,
  MyTask,
  TeamMember,
  ReactionSummary,
  PageTemplate,
  TemplateInput,
  PagePath,
  CommentAnchor,
  PageNode,
  SpaceGrant,
  MigrationDeadLetter,
  MigrationDiscoverResult,
  MigrationIssueSummary,
  MigrationItem,
  MigrationItemFilter,
  MigrationItemPage,
  MigrationJob,
  MigrationJobRecord,
  MigrationJobSummary,
  MigrationMode,
  MigrationProvider,
  MigrationReport,
  MigrationSourceInput,
  MigrationSourceProbe,
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

/** 개인 스페이스(W23) — 백엔드와 같이 key는 `me-{id}`, 한 사람에 하나(멱등). */
export async function ensurePersonalSpace(): Promise<Space> {
  const data = load();
  const existing = data.spaces.find((s) => s.ownerId === CURRENT_USER_ID);
  if (existing) return clone(existing);
  const me = data.users.find((u) => u.id === CURRENT_USER_ID);
  const space: Space = {
    id: nextId(),
    key: `me-${CURRENT_USER_ID}`,
    name: `${me?.name ?? "사용자"}의 스페이스`,
    createdAt: new Date().toISOString(),
    ownerId: CURRENT_USER_ID,
  };
  data.spaces.push(space);
  persist();
  return clone(space);
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

export async function updateSpace(
  spaceId: string,
  input: { name: string; description?: string },
): Promise<Space> {
  const data = load();
  const space = data.spaces.find((s) => s.id === spaceId);
  if (!space) throw new Error("스페이스를 찾을 수 없습니다");
  const name = input.name.trim();
  if (!name) throw new Error("스페이스 이름을 입력하세요");
  space.name = name;
  space.description = input.description?.trim() || undefined;
  persist();
  return clone(space);
}

/** 되돌릴 수 없다 — 그 스페이스의 페이지·버전·댓글·라벨·휴지통까지 함께 사라진다. */
export async function deleteSpace(spaceId: string): Promise<void> {
  const data = load();
  const space = data.spaces.find((s) => s.id === spaceId);
  if (!space) throw new Error("스페이스를 찾을 수 없습니다");
  const doomed = new Set(data.pages.filter((p) => p.spaceId === spaceId).map((p) => p.id));
  // 삭제 기록은 스페이스보다 오래 남는다(백엔드 V30과 같은 규칙)
  (data.spaceAudit ??= []).unshift({
    id: `sa${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action: "SPACE_DELETED",
    targetType: "SPACE",
    targetId: spaceId,
    targetLabel: `${space.name} (${space.key})`,
    detail: `문서 ${doomed.size}건 함께 삭제`,
    actorId: CURRENT_USER_ID,
    createdAt: new Date().toISOString(),
  });
  data.spaces = data.spaces.filter((s) => s.id !== spaceId);
  data.pages = data.pages.filter((p) => p.spaceId !== spaceId);
  data.versions = data.versions.filter((v) => !doomed.has(v.pageId));
  data.comments = data.comments.filter((c) => !doomed.has(c.pageId));
  data.trash = (data.trash ?? []).filter((t) => t.page.spaceId !== spaceId);
  for (const id of doomed) delete data.labels?.[id];
  persist();
}

/* ── 스페이스 권한(W22) ──────────────────────────────────── */

/**
 * 목업은 org-service가 없다. 저장소에 권한 목록을 두고 같은 계약으로만 응답한다 —
 * 목업이 더 관대하면 화면이 목업에서만 동작하고 백엔드 모드에서 403으로 깨진다.
 */
export async function listSpaceGrants(spaceId: string): Promise<SpaceGrant[]> {
  return clone((load().grants ?? {})[spaceId] ?? []);
}

export async function addSpaceGrant(
  spaceId: string,
  input: { subjectType: "user" | "team"; subjectId: string; role: SpaceGrant["role"] },
): Promise<SpaceGrant> {
  const data = load();
  data.grants ??= {};
  const current = data.grants[spaceId] ?? [];
  if (current.some((g) => g.subjectType === input.subjectType && g.subjectId === input.subjectId)) {
    throw new Error("이미 권한이 있는 대상입니다");
  }
  const grant: SpaceGrant = { id: nextId(), ...input };
  data.grants[spaceId] = [...current, grant];
  persist();
  return clone(grant);
}

export async function removeSpaceGrant(grantId: string): Promise<void> {
  const data = load();
  data.grants ??= {};
  for (const [spaceId, list] of Object.entries(data.grants)) {
    data.grants[spaceId] = list.filter((g) => g.id !== grantId);
  }
  persist();
}

// ── pages ────────────────────────────────────────────────────


export async function getPage(id: string): Promise<Page | null> {
  const page = load().pages.find((p) => p.id === id);
  return page ? clone(page) : null;
}

/** 버전 스냅샷 부수효과: 현재 페이지 내용을 version = max+1로 쌓는다 */
function snapshotVersion(data: WikiData, page: Page, at: string, changeNote?: string): void {
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
    savedByName: data.users.find((u) => u.id === CURRENT_USER_ID)?.name ?? null,
    savedAt: at,
    // 공백만 있는 요약은 없는 것과 같다(백엔드와 같은 규칙) — 화면이 빈 칩을 그리지 않도록.
    changeNote: changeNote?.trim() ? changeNote.trim() : undefined,
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
    ...(input.type === "blog" ? { parentId: null } : {}),
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
  // 곧바로 게시된 문서는 그 순간이 곧 "새 문서 게시"다 — publish 경로만 알리면 대부분의 문서가
  // 스페이스 구독자에게 조용히 지나간다(W27-4). 폴더는 읽을 내용이 없으므로 제외한다.
  if (page.status === "published" && page.type !== "folder") notifyPagePublished(data, page);
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
  snapshotVersion(data, page, page.updatedAt, options.changeNote); // 적용 후 내용을 새 버전(max+1)으로
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
/* ── 팀(W23) — 목업은 시드 두 팀에 더해 만든 팀을 저장한다. 팀원은 사용자 id 목록 ── */
const SEED_TEAMS: Team[] = [
  { id: "t1", name: "플랫폼팀" },
  { id: "t2", name: "디자인팀" },
];

export async function listTeams(): Promise<Team[]> {
  const data = load();
  return [...SEED_TEAMS, ...(data.teams ?? [])].map((t) => ({ ...t }));
}

export async function createTeam(name: string): Promise<Team> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("팀 이름을 입력하세요");
  if ((await listTeams()).some((t) => t.name === trimmed)) throw new Error(`이미 존재하는 팀 이름: ${trimmed}`);
  const data = load();
  const team: Team = { id: nextId(), name: trimmed };
  (data.teams ??= []).push(team);
  persist();
  return { ...team };
}

export async function deleteTeam(teamId: string): Promise<void> {
  const data = load();
  if (SEED_TEAMS.some((t) => t.id === teamId)) throw new Error("기본 팀은 지울 수 없습니다");
  data.teams = (data.teams ?? []).filter((t) => t.id !== teamId);
  if (data.teamMembers) delete data.teamMembers[teamId];
  persist();
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const data = load();
  return (data.teamMembers?.[teamId] ?? []).map((id) => ({
    memberId: id,
    displayName: data.users.find((u) => u.id === id)?.name ?? null,
    role: "MEMBER",
  }));
}

export async function addTeamMember(teamId: string, memberId: string): Promise<void> {
  const data = load();
  data.teamMembers ??= {};
  const set = new Set(data.teamMembers[teamId] ?? []);
  set.add(memberId); // 멱등 — 백엔드와 같다
  data.teamMembers[teamId] = [...set];
  persist();
}

export async function removeTeamMember(teamId: string, memberId: string): Promise<void> {
  const data = load();
  if (!data.teamMembers?.[teamId]) return;
  data.teamMembers[teamId] = data.teamMembers[teamId].filter((id) => id !== memberId);
  persist();
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

/**
 * 새 문서 게시(W27-4) — 스페이스 구독자가 기다리던 사건이다.
 * 곧바로 게시된 문서와 초안이 게시로 넘어가는 순간, 두 경로에서 한 번씩 부른다.
 *
 * 대상은 구독자만이다 — 본문에 멘션된 사람은 넣지 않는다. 문서 생성은 예전부터 멘션 알림의
 * 트리거가 아니었고, 여기서 게시로 대신 보내면 그 결정을 뒷문으로 뒤집는 셈이 된다.
 */
function notifyPagePublished(data: WikiData, page: Page): void {
  const interested = subscribersOf(data, page);
  interested.delete(CURRENT_USER_ID); // 자기가 게시한 문서를 자기 알림함에서 다시 볼 이유가 없다
  for (const id of interested) deliver(data, id, "page_published", page);
}

function notifyCommentAdded(data: WikiData, page: Page, commentBody: string): void {
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

/* ── 알림 설정(W23) — 목업은 발송 구성이 없다(emailConfigured=false). 스위치만 저장한다. */

const DEFAULT_PREFS: NotificationPrefsPatch = {
  emailEnabled: true, emailMode: "IMMEDIATE", mentioned: true, pageUpdated: true, comment: true, shared: true,
};

function prefsView(data: WikiData): NotificationPrefs {
  // 이 필드 도입 이전 저장분은 emailMode가 없다 — 기본값으로 채운다
  const saved = { ...DEFAULT_PREFS, ...(data.notificationPrefs?.[CURRENT_USER_ID] ?? {}) };
  return { ...saved, emailConfigured: false, email: null };
}

/** 스페이스 삭제 기록 — 목업은 전역 관리자 판정이 없어 그대로 돌려준다. */
export async function listSpaceDeletions(): Promise<AuditEntry[]> {
  return [...(load().spaceAudit ?? [])];
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
  notifyPagePublished(data, page); // 스페이스 구독자가 기다리던 사건(W27-4)
  persist();
  return clone(page);
}

/**
 * 단일 페이지 복제 — 백엔드 v1 계약과 동일한 범위: 하위·댓글 미복사, 제목 "(사본)",
 * 부모·타입·상태 유지, 형제 맨 뒤. (목업엔 첨부 저장이 없어 첨부 복사는 해당 없음.)
 */
export async function copyPage(id: string, options?: CopyPageOptions): Promise<Page> {
  const data = load();
  const source = data.pages.find((p) => p.id === id);
  if (!source) throw new Error("페이지를 찾을 수 없습니다");
  const siblings = data.pages.filter(
    (p) => p.spaceId === source.spaceId && p.parentId === source.parentId,
  );
  const now = new Date().toISOString();

  // 부모가 먼저 오는 순서로 모은다 — 자식이 부모의 새 id를 필요로 한다.
  const ordered: Page[] = [source];
  if (options?.includeDescendants) {
    for (let i = 0; i < ordered.length; i++) {
      ordered.push(...data.pages.filter((p) => p.parentId === ordered[i].id));
    }
  }

  const newIdOf = new Map<string, string>();
  let root: Page | null = null;
  for (const original of ordered) {
    const isRoot = original.id === source.id;
    const copy: Page = {
      ...clone(original),
      id: nextId(),
      // 사본 표시는 뿌리에만 — 하위까지 제목을 바꾸면 본문의 `[[제목]]`이 전부 어긋난다.
      title: isRoot ? `${original.title} (사본)` : original.title,
      parentId: isRoot ? original.parentId : (newIdOf.get(original.parentId ?? "") ?? null),
      position: isRoot ? Math.max(0, ...siblings.map((p) => p.position)) + 1 : original.position,
      version: 1,
      createdBy: CURRENT_USER_ID,
      updatedBy: CURRENT_USER_ID,
      createdAt: now,
      updatedAt: now,
      // 사본은 원본의 소유자·검증을 물려받지 않는다(W27-5) — 아무도 읽지 않은 문서가 "검증됨"으로
      // 태어나면 배지가 거짓말이 된다. 백엔드 copy도 새 Page를 만들어 같은 결과다.
      ownerId: null,
      verifiedAt: null,
      verifiedBy: null,
      verifiedUntil: null,
    };
    newIdOf.set(original.id, copy.id);
    data.pages.push(copy);
    if (isRoot) root = copy;
  }
  persist();
  return clone(root as Page);
}

/* ── 페이지 템플릿(W23) ──────────────────────────────────── */

function normalizeTemplateName(raw: string): string {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) throw new Error("템플릿 이름을 입력하세요");
  if (value.length > 100) throw new Error("템플릿 이름은 100자를 넘을 수 없습니다");
  return value;
}

export async function listTemplates(spaceId: string): Promise<PageTemplate[]> {
  const data = load();
  return (data.templates ?? [])
    .filter((t) => t.spaceId === spaceId)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    .map((t) => ({ ...t }));
}

export async function createTemplate(spaceId: string, input: TemplateInput): Promise<PageTemplate> {
  const data = load();
  data.templates ??= [];
  const name = normalizeTemplateName(input.name);
  if (data.templates.some((t) => t.spaceId === spaceId && t.name === name)) {
    throw new Error(`같은 이름의 템플릿이 이미 있습니다: ${name}`);
  }
  if (data.templates.filter((t) => t.spaceId === spaceId).length >= 50) {
    throw new Error("템플릿은 스페이스당 50개까지입니다");
  }
  const template: PageTemplate = {
    id: nextId(),
    spaceId,
    name,
    description: input.description ?? null,
    icon: input.icon ?? null,
    content: input.content ?? "",
    updatedAt: new Date().toISOString(),
  };
  data.templates.push(template);
  persist();
  return { ...template };
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<PageTemplate> {
  const data = load();
  const template = (data.templates ?? []).find((t) => t.id === id);
  if (!template) throw new Error("템플릿을 찾을 수 없습니다");
  const name = normalizeTemplateName(input.name);
  if ((data.templates ?? []).some((t) => t.spaceId === template.spaceId && t.name === name && t.id !== id)) {
    throw new Error(`같은 이름의 템플릿이 이미 있습니다: ${name}`);
  }
  template.name = name;
  template.description = input.description ?? null;
  template.icon = input.icon ?? null;
  template.content = input.content ?? "";
  template.updatedAt = new Date().toISOString();
  persist();
  return { ...template };
}

export async function deleteTemplate(id: string): Promise<void> {
  const data = load();
  data.templates = (data.templates ?? []).filter((t) => t.id !== id);
  persist();
}

/** 본문만 가져온다 — 제목까지 가져오면 그 템플릿으로 만든 문서마다 같은 제목이 붙는다. */
export async function savePageAsTemplate(pageId: string, name?: string): Promise<PageTemplate> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  return createTemplate(page.spaceId, {
    name: name ?? page.title,
    icon: page.icon ?? null,
    content: page.body,
  });
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
    // 블로그 글(W24)은 부모가 없어도 트리가 아니다 — 백엔드 findChildren과 같은 제외
    .filter((p) => p.spaceId === spaceId && p.parentId === parentId && !p.archivedAt && p.type !== "blog")
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((p) => toNode(data, p));
}

/** PDF는 서버 렌더러(W26)가 만든다 — 목업에는 없다. 다이얼로그가 목업에서는 인쇄 버튼을 대신 보여준다. */
export async function downloadPagePdf(): Promise<void> {
  throw new Error("PDF 내보내기는 백엔드 연결에서만 동작합니다 — 브라우저 인쇄를 쓰세요");
}

/** 블로그(W24) — 최신 작성순. 발췌는 백엔드 BlogPostView.excerptOf와 같은 규칙(기호 걷어내고 200자). */
export async function listBlogPosts(spaceId: string): Promise<BlogPost[]> {
  return load().pages
    .filter((p) => p.spaceId === spaceId && p.type === "blog" && !p.archivedAt)
    // 같은 밀리초에 만든 글은 생성 순(position)이 시각보다 정확하다 — id는 무작위라 순서가 없다
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.position - a.position)
    .map((p) => ({
      id: p.id, title: p.title, status: p.status, icon: p.icon ?? null,
      createdBy: p.createdBy, updatedBy: p.updatedBy, createdAt: p.createdAt, updatedAt: p.updatedAt,
      excerpt: excerptOf(p.body),
    }));
}

function excerptOf(markdown: string): string {
  const text = markdown
    .replace(/^\s*:{2,}[^\n]*$/gm, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, "")
    .replace(/^\s*[-*+>]\s+/gm, "")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= 200 ? text : `${text.slice(0, 200).trim()}…`;
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

/** 최근 수정 순 — 스페이스 개요의 "최근 업데이트". 전량을 읽어 정렬하던 것을 대체한다. */
export async function listRecentlyUpdated(spaceId: string, limit = 8): Promise<PageNode[]> {
  const data = load();
  return data.pages
    .filter((p) => p.spaceId === spaceId && !p.archivedAt)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, Math.min(Math.max(limit, 1), TREE_SEARCH_LIMIT))
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
    .filter((p) => p.spaceId === spaceId && !p.archivedAt && p.title.toLowerCase().includes(q))
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

/** 접근 가능한 스페이스 전체의 라벨 후보 — 백엔드와 같이 접두 일치, 건수 많은 순. */
export async function suggestLabels(query: string): Promise<LabelCount[]> {
  const data = load();
  const prefix = query.trim() === "" ? "" : normalizeLabel(query);
  const counts = new Map<string, number>();
  for (const page of data.pages) {
    for (const name of data.labels?.[page.id] ?? []) {
      if (prefix !== "" && !name.startsWith(prefix)) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1))
    .slice(0, 20);
}

/** 조상 경로 — 루트부터 부모까지, 자기 자신은 뺀다(백엔드 계약과 같다). */
export async function listPagePaths(pageIds: string[]): Promise<PagePath[]> {
  const data = load();
  const byId = new Map(data.pages.map((p) => [p.id, p]));
  return pageIds.flatMap((id) => {
    if (!byId.has(id)) return [];
    const titles: string[] = [];
    const seen = new Set<string>([id]);
    let cursor = byId.get(id)?.parentId ?? null;
    while (cursor !== null && !seen.has(cursor)) {
      seen.add(cursor);
      const parent = byId.get(cursor);
      if (!parent) break;
      titles.unshift(parent.title);
      cursor = parent.parentId;
    }
    return [{ id, titles }];
  });
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
/* ── 보관(W23) — 백엔드와 같은 규칙: 루트 표시 + 하위 cascade, 따로 보관한 묶음은 경계 ── */

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

/** 한 버전의 본문까지 — 백엔드 모드와 같은 계약(목록은 메타만, 본문은 단건 조회). */
export async function getVersion(pageId: string, versionId: string): Promise<PageVersion> {
  const version = load().versions.find((v) => v.id === versionId && v.pageId === pageId);
  if (!version) throw new Error("버전을 찾을 수 없습니다");
  return clone(version);
}

export async function restoreVersion(pageId: string, versionId: string): Promise<Page> {
  const data = load();
  const version = data.versions.find((v) => v.id === versionId && v.pageId === pageId);
  if (!version) throw new Error("버전을 찾을 수 없습니다");
  // updatePage 경로 재사용 → 복원도 새 버전으로 쌓인다 (히스토리 안 끊김).
  // 어느 버전에서 되돌렸는지가 다음 사람에게 가장 중요한 정보다(백엔드와 같은 문구).
  return updatePage(
    pageId,
    { title: version.title, body: version.body },
    { changeNote: `v${version.version} 버전으로 복원` },
  );
}

// ── comments ─────────────────────────────────────────────────

export async function listComments(pageId: string): Promise<Comment[]> {
  const data = load();
  return clone(
    data.comments
      .filter((c) => c.pageId === pageId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ ...c, reactions: summarizeReactions(data, `COMMENT:${c.id}`) })),
  );
}

/* ── 액션 아이템(W23) — 본문에서 매번 파싱한다(목업은 파생 표가 없다) ── */

export async function listMyTasks(done: boolean): Promise<MyTask[]> {
  const data = load();
  const spaces = new Map(data.spaces.map((s) => [s.id, s]));
  const out: MyTask[] = [];
  for (const page of data.pages) {
    if (page.archivedAt) continue;
    for (const t of parseTasks(page.body)) {
      if (t.assigneeId !== CURRENT_USER_ID || t.done !== done) continue;
      out.push({
        pageId: page.id,
        spaceId: page.spaceId,
        spaceName: spaces.get(page.spaceId)?.name ?? null,
        pageTitle: page.title,
        ...t,
      });
    }
  }
  // 백엔드와 같은 순서 — 기한 있는 것이 먼저(임박한 순), 없는 것은 뒤
  return out.sort((a, b) => {
    if (a.dueDate === null && b.dueDate !== null) return 1;
    if (a.dueDate !== null && b.dueDate === null) return -1;
    return (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || a.pageId.localeCompare(b.pageId) || a.lineNo - b.lineNo;
  });
}

export async function setTaskDone(pageId: string, lineNo: number, done: boolean): Promise<MyTask> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  if (page.archivedAt) throw new Error("보관된 문서는 편집할 수 없습니다. 먼저 보관을 해제하세요");
  const next = toggleTaskLine(page.body, lineNo, done);
  if (next === null) throw new Error("그 줄은 더 이상 작업 항목이 아닙니다. 문서를 새로고침하세요");
  // 편집이다 — 버전·리비전이 따라간다(updatePage와 같은 경로)
  await updatePage(pageId, { body: next }, { changeNote: done ? "작업 완료 표시" : "작업 다시 열기" });
  const refreshed = load().pages.find((p) => p.id === pageId) as Page;
  const task = parseTasks(refreshed.body).find((t) => t.lineNo === lineNo) as ParsedTask;
  return {
    pageId,
    spaceId: refreshed.spaceId,
    spaceName: load().spaces.find((s) => s.id === refreshed.spaceId)?.name ?? null,
    pageTitle: refreshed.title,
    ...task,
  };
}

/* ── 리액션(W23) — 백엔드와 같은 규칙: 고정 집합, 사용자·이모지당 하나, 집합 순서로 집계 ── */

function summarizeReactions(data: WikiData, key: string): ReactionSummary[] {
  const byUser = data.reactions?.[key] ?? {};
  return REACTION_EMOJIS.flatMap((emoji) => {
    const users = Object.entries(byUser).filter(([, emojis]) => emojis.includes(emoji)).map(([u]) => u);
    return users.length === 0
      ? []
      : [{ emoji, count: users.length, reacted: users.includes(CURRENT_USER_ID) }];
  });
}

function setReaction(key: string, emoji: string, on: boolean): ReactionSummary[] {
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
    throw new Error(`지원하지 않는 리액션입니다: ${emoji}`);
  }
  const data = load();
  data.reactions ??= {};
  data.reactions[key] ??= {};
  const mine = new Set(data.reactions[key][CURRENT_USER_ID] ?? []);
  if (on) mine.add(emoji);
  else mine.delete(emoji);
  data.reactions[key][CURRENT_USER_ID] = [...mine];
  persist();
  return summarizeReactions(data, key);
}

export async function listPageReactions(pageId: string): Promise<ReactionSummary[]> {
  const data = load();
  if (!data.pages.some((p) => p.id === pageId)) throw new Error("페이지를 찾을 수 없습니다");
  return summarizeReactions(data, `PAGE:${pageId}`);
}

export async function setPageReaction(pageId: string, emoji: string, on: boolean): Promise<ReactionSummary[]> {
  if (!load().pages.some((p) => p.id === pageId)) throw new Error("페이지를 찾을 수 없습니다");
  return setReaction(`PAGE:${pageId}`, emoji, on);
}

export async function setCommentReaction(commentId: string, emoji: string, on: boolean): Promise<ReactionSummary[]> {
  if (!load().comments.some((c) => c.id === commentId)) throw new Error("코멘트를 찾을 수 없습니다");
  return setReaction(`COMMENT:${commentId}`, emoji, on);
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

/**
 * 소유자 지정·해제. 메타데이터라 version·updatedAt·버전 스냅샷을 건드리지 않는다
 * (setPageIcon·movePage와 같은 취급) — 담당자가 바뀌었다고 문서가 고쳐진 것은 아니다.
 */
export async function setPageOwner(pageId: string, ownerId: string | null): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  page.ownerId = ownerId;
  persist();
  return clone(page);
}

/** 검증. until이 없으면 기본 90일(백엔드 PageService.VERIFICATION_DAYS와 같은 값). */
export async function verifyPage(pageId: string, until?: string): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  page.verifiedAt = new Date().toISOString();
  page.verifiedBy = CURRENT_USER_ID;
  page.verifiedUntil = until ?? defaultVerifiedUntil();
  persist();
  return clone(page);
}

export async function unverifyPage(pageId: string): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  page.verifiedAt = null;
  page.verifiedBy = null;
  page.verifiedUntil = null;
  persist();
  return clone(page);
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

export async function listAttachmentVersions(
  _id: string,
): Promise<import("./types").AttachmentVersion[]> {
  return []; // 첨부가 없으니 버전도 없다 — 화면이 빈 목록으로 조용히 접힌다
}

export async function restoreAttachmentVersion(_id: string, _version: number): Promise<Attachment> {
  throw new Error("목업 모드에서는 첨부를 지원하지 않습니다");
}

/**
 * 목업에는 서버 원장이 없다 — null로 그 사실을 알린다.
 *
 * 빈 목록을 주면 동기화가 브라우저에 있던 별표를 지운다. "서버에 없다"와 "서버가 없다"는
 * 다른 말이고, 이 구분을 흐리면 목업 모드에서 별표가 사라진다.
 */
export async function listStars(): Promise<null> {
  return null;
}

export async function setPageStar(_pageId: string, _starred: boolean): Promise<void> {
  // 목업은 브라우저 저장소가 곧 원장이다(lib/starredPages) — 여기서 더 할 일이 없다.
}

export async function setSpaceStar(_spaceId: string, _starred: boolean): Promise<void> {
  // setPageStar와 같은 이유.
}

export async function listRecentPages(_limit?: number): Promise<null> {
  return null; // 최근 방문도 브라우저 기록(lib/recentVisits)이 원장이다
}

/** 목업에는 감사 기록이 없다 — 빈 목록이면 화면이 "기록이 없습니다"로 접힌다. */
export async function listAudit(_spaceId: string): Promise<import("./types").AuditEntry[]> {
  return [];
}

export async function listGrantAudit(_spaceId: string): Promise<import("./types").AuditEntry[]> {
  return []; // 목업에는 org 원장이 없다 — 위키 감사와 같이 빈 목록이다
}

/** 목업에는 검색 색인이 없다 — null은 "권한 없음"과 같은 취급을 받아 관리 메뉴가 뜨지 않는다. */
export async function getSearchIndexStatus(): Promise<null> {
  return null;
}

export async function startReindex(): Promise<never> {
  throw new Error("목업 모드에서는 재색인을 지원하지 않습니다");
}

export async function getReindexJob(_jobId: string): Promise<never> {
  throw new Error("목업 모드에서는 재색인을 지원하지 않습니다");
}

export function attachmentVersionUrl(id: string, version: number): string {
  return `/api/wiki/attachments/${id}/versions/${version}`;
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

/** ISO 시각 또는 날짜(2026-08-01)를 밀리초로. 잘못된 값은 백엔드처럼 거부한다. */
function toBoundaryMillis(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(parsed)) throw new Error("기간은 날짜 형식이어야 합니다");
  return parsed;
}

/** 목업 모드도 화면과 같은 검색 계약을 제공한다. 첨부파일은 목업 스토리지가 없어 PAGE만 검색한다. */
export async function searchContent(input: SearchContentInput): Promise<SearchResults> {
  const query = input.query.trim();
  if (!query) return { total: 0, totalExact: true, tookMs: 0, hits: [] };

  const data = load();
  const spaces = new Map(data.spaces.map((space) => [space.id, space]));
  const allowedSpaces = input.spaceIds ? new Set(input.spaceIds) : null;
  const pagesRequested = !input.docTypes || input.docTypes.length === 0 || input.docTypes.includes("PAGE");
  // 작성자·기간 필터(W22) — 백엔드와 같은 규칙이다. 경계는 포함이고, 날짜만 오면 그 날의 시작으로 읽는다.
  const authors = input.authorIds?.length ? new Set(input.authorIds) : null;
  const after = toBoundaryMillis(input.updatedAfter);
  const before = toBoundaryMillis(input.updatedBefore);
  // 라벨은 저장할 때와 같은 규칙으로 정규화해 맞춘다 — 대소문자만 달라 안 걸리면 사용자는 이유를 모른다.
  const sort = input.sort ?? "RELEVANCE";
  const wantedLabels = input.labels?.length
    ? new Set(input.labels.map(normalizeLabel).filter((name) => name.length > 0))
    : null;
  const pageHits: SearchHit[] = !pagesRequested
    ? []
    : data.pages.flatMap((page): SearchHit[] => {
        if (page.status === "draft" || page.archivedAt || (allowedSpaces && !allowedSpaces.has(page.spaceId))) return [];
        if (authors && !authors.has(page.updatedBy)) return [];
        if (wantedLabels && !(data.labels?.[page.id] ?? []).some((name) => wantedLabels.has(name))) return [];
        const updatedMillis = Date.parse(page.updatedAt);
        if (after !== null && !(updatedMillis >= after)) return [];
        if (before !== null && !(updatedMillis <= before)) return [];
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
          pageType: page.type === "folder" ? "FOLDER" : page.type === "blog" ? "BLOG" : "PAGE",
          title: page.title,
          filename: null,
          highlights: [titleHighlight, bodyHighlight].filter((value): value is string => value !== null),
          updatedAt: page.updatedAt,
          score: (titleHighlight ? 3 : 0) + (bodyHighlight ? 1 : 0),
        }];
      });

  // 정렬은 백엔드와 같은 규칙이다 — 동점은 방향을 따라 id로 가른다(페이지를 넘길 때 순서가 흔들리면 안 된다).
  pageHits.sort((a, b) => {
    if (sort === "UPDATED_DESC") {
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || b.id.localeCompare(a.id);
    }
    if (sort === "UPDATED_ASC") {
      return (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "") || a.id.localeCompare(b.id);
    }
    return b.score - a.score || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || b.id.localeCompare(a.id);
  });
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

// ── 마이그레이션(M1, 컨플루언스 DC) ────────────────────────────
/*
 * 목업은 **고정 시나리오**다(설계 §2). 실제로 DC에 붙지 않고, 화면이 파이프라인 한 바퀴를
 * — 연결 확인 → 잡 생성 → 발견 → 시작 → 진행 → 보고서 → 데드레터 — 끝까지 그릴 수 있는
 * 만큼만 흉내낸다.
 *
 * 진행은 시간이 아니라 **폴링 횟수**로 움직인다. 목업에 타이머를 두면 테스트가 실제 시계를
 * 기다려야 하고, 느린 CI에서 몇 틱이 지났는지가 달라져 결과가 흔들린다. getMigrationJob을
 * 부를 때마다 3건씩 나아가고, 보고서 조회는 상태를 **읽기만** 한다 — 한 번의 폴링에서 잡과
 * 보고서를 같이 읽는 화면이 서로 다른 시점을 보면 안 되기 때문이다.
 */

/** 발견되는 원본 페이지 수 — 12건. */
const MOCK_DISCOVERED = 12;
/** 폴링 한 번에 처리되는 항목 수. */
const MOCK_ITEMS_PER_TICK = 3;

/** 몇 번째 항목이 어떤 경고를 남기는가(1부터). 항목이 처리돼야 보고서에 나타난다. */
const MOCK_ISSUE_BY_ORDINAL: Record<number, { code: string; sourcePath: string }> = {
  3: { code: "MACRO_OPAQUE", sourcePath: "macro:jira" },
  7: { code: "ATTACHMENT_NOT_COPIED", sourcePath: "attachment:설계도.png" },
};
/** 원본에서 사라진 페이지 — 재시도해도 안 되는 데드레터 한 건. */
const MOCK_DEAD_LETTER_ORDINAL = MOCK_DISCOVERED;

function migrationsOf(data: WikiData): MigrationJobRecord[] {
  return (data.migrations ??= []);
}

function findMigration(data: WikiData, id: string): MigrationJobRecord {
  const found = migrationsOf(data).find((j) => j.id === id);
  if (!found) throw new Error("마이그레이션 잡을 찾을 수 없습니다");
  return found;
}

/** 항목 순번 — externalObjectId가 아니라 배열 위치로 센다. */
function ordinalOf(record: MigrationJobRecord, item: MigrationItem): number {
  return record.items.indexOf(item) + 1;
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function migrationJobView(record: MigrationJobRecord): MigrationJob {
  return clone({
    id: record.id,
    provider: record.provider,
    sourceInstanceId: record.sourceInstanceId,
    targetSpaceId: record.targetSpaceId,
    mode: record.mode,
    status: record.status,
    itemCount: record.items.length,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
    source: record.source,
    counts: {
      byStatus: countBy(record.items.map((i) => i.status)),
      byStage: countBy(record.items.map((i) => i.stage)),
    },
  });
}

/** 처리된 항목에서 손실을 집계한다 — 심각도(ERROR→WARNING→INFO) 다음 code 순. */
function migrationIssues(record: MigrationJobRecord): MigrationIssueSummary[] {
  const byCode = new Map<string, MigrationIssueSummary>();
  for (const item of record.items) {
    if (item.status !== "COMPLETED") continue;
    const issue = MOCK_ISSUE_BY_ORDINAL[ordinalOf(record, item)];
    if (!issue) continue;
    const found = byCode.get(issue.code);
    if (found) {
      found.distinctPaths += 1;
      found.occurrences += 1;
    } else {
      byCode.set(issue.code, {
        severity: "WARNING",
        code: issue.code,
        distinctPaths: 1,
        occurrences: 1,
        sampleSourcePath: issue.sourcePath,
      });
    }
  }
  const rank: Record<MigrationIssueSummary["severity"], number> = { ERROR: 0, WARNING: 1, INFO: 2 };
  return [...byCode.values()].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code),
  );
}

function migrationDeadLetters(record: MigrationJobRecord): MigrationDeadLetter[] {
  return record.items
    .filter((item) => item.status === "DEAD_LETTER")
    .map((item) => ({
      itemId: item.id,
      externalObjectId: item.externalObjectId,
      stage: item.stage,
      lastErrorCode: item.lastErrorCode,
      retryCount: item.retryCount,
      deadLetteredAt: item.nextAttemptAt,
    }));
}

/**
 * 폴링 한 번 분량을 진행시킨다. RUNNING이 아니면(아직 시작 전·취소·완료) 아무것도 하지 않는다 —
 * 취소한 잡이 조회만으로 다시 굴러가면 취소가 취소가 아니다.
 */
function advanceMigration(record: MigrationJobRecord): boolean {
  if (record.status !== "RUNNING") return false;
  let moved = 0;
  for (const item of record.items) {
    if (moved >= MOCK_ITEMS_PER_TICK) break;
    if (item.status !== "PENDING") continue;
    const ordinal = ordinalOf(record, item);
    if (ordinal === MOCK_DEAD_LETTER_ORDINAL) {
      item.status = "DEAD_LETTER";
      item.stage = "EXTRACT";
      item.retryCount = 3;
      item.lastErrorCode = "DC_NOT_FOUND";
      item.nextAttemptAt = new Date().toISOString();
    } else {
      item.status = "COMPLETED";
      item.stage = "DONE";
      // dry-run은 페이지를 만들지 않는다 — 보고서만 남는다(설계 §1.4 RESOLVE).
      item.targetPageId = record.mode === "IMPORT" ? `mig-${record.id}-${ordinal}` : null;
    }
    moved += 1;
  }
  if (record.items.every((item) => item.status === "COMPLETED" || item.status === "DEAD_LETTER")) {
    record.status = "COMPLETED";
    record.completedAt = new Date().toISOString();
  }
  return moved > 0;
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/** 연결 확인(M-01). 토큰은 **여기서 소비하고 버린다** — 어디에도 저장하지 않는다. */
export async function probeConfluenceDc(input: MigrationSourceInput): Promise<MigrationSourceProbe> {
  if (!/^https?:\/\//.test(input.baseUrl.trim())) {
    throw new Error("원본 주소는 http:// 또는 https://로 시작해야 합니다");
  }
  if (!input.spaceKey.trim()) throw new Error("스페이스 키를 입력하세요");
  if (!input.token.trim()) throw new Error("접근 토큰을 입력하세요");
  return { spaceName: "제품 문서", homepageId: "16777217", pageCount: MOCK_DISCOVERED };
}

/**
 * 잡 목록. 백엔드 모드는 전역 관리자가 아니면 null(403)을 주지만, 목업에는 판정할 서버가
 * 없으므로 항상 목록을 준다 — 화면은 null만 "권한 없음"으로 다룬다.
 */
export async function listMigrationJobs(): Promise<MigrationJobSummary[] | null> {
  const data = load();
  // 같은 밀리초에 만든 잡은 createdAt이 같다 — 뒤에 넣은 것이 새 것이므로 뒤집고 나서 안정 정렬한다.
  return [...migrationsOf(data)]
    .reverse()
    .map((record) => ({
      id: record.id,
      provider: record.provider,
      targetSpaceId: record.targetSpaceId,
      mode: record.mode,
      status: record.status,
      createdAt: record.createdAt,
      discoveredCount: record.source?.discoveredCount ?? record.items.length,
      sourceSpaceKey: record.source?.spaceKey ?? null,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 50);
}

export async function createMigrationJob(input: {
  provider: MigrationProvider;
  targetSpaceId: string;
  mode: MigrationMode;
  source?: MigrationSourceInput;
}): Promise<MigrationJob> {
  const data = load();
  if (!data.spaces.some((s) => s.id === input.targetSpaceId)) {
    throw new Error("대상 스페이스를 찾을 수 없습니다");
  }
  if (input.provider === "CONFLUENCE_DC" && !input.source) {
    throw new Error("원본 접속 정보가 필요합니다");
  }
  const record: MigrationJobRecord = {
    id: nextId(),
    provider: input.provider,
    // 서버는 baseUrl 호스트로 채운다 — 목업도 같은 규칙을 흉내낸다.
    sourceInstanceId: input.source ? hostOf(input.source.baseUrl) : null,
    targetSpaceId: input.targetSpaceId,
    mode: input.mode,
    status: "PENDING",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    // token은 담지 않는다 — 저장 형태에 자리조차 없다.
    source: input.source
      ? { baseUrl: input.source.baseUrl, spaceKey: input.source.spaceKey, spaceName: null, discoveredCount: 0 }
      : null,
    items: [],
  };
  migrationsOf(data).push(record);
  persist();
  return migrationJobView(record);
}

/** 재발견은 멱등이다 — 이미 있는 항목은 skipped로 세고 새 항목만 더한다. */
export async function discoverMigrationJob(id: string): Promise<MigrationDiscoverResult> {
  const data = load();
  const record = findMigration(data, id);
  if (record.status !== "PENDING") throw new Error("이미 시작한 잡은 다시 발견할 수 없습니다");
  let enqueued = 0;
  let skipped = 0;
  for (let ordinal = 1; ordinal <= MOCK_DISCOVERED; ordinal += 1) {
    const externalObjectId = String(100000 + ordinal);
    if (record.items.some((item) => item.externalObjectId === externalObjectId)) {
      skipped += 1;
      continue;
    }
    record.items.push({
      id: `${record.id}-${ordinal}`,
      jobId: record.id,
      externalObjectId,
      sourceVersion: "1",
      stage: "EXTRACT",
      status: "PENDING",
      retryCount: 0,
      nextAttemptAt: null,
      targetPageId: null,
      lastErrorCode: null,
    });
    enqueued += 1;
  }
  if (record.source) {
    record.source.spaceName = "제품 문서";
    record.source.discoveredCount = record.items.length;
  }
  persist();
  return { discovered: MOCK_DISCOVERED, enqueued, skipped };
}

export async function startMigrationJob(id: string): Promise<MigrationJob> {
  const data = load();
  const record = findMigration(data, id);
  // 발견 없이 시작하면 서버는 400 MIGRATION_NOTHING_DISCOVERED를 준다(설계 §1.3).
  if (record.items.length === 0) throw new Error("발견된 항목이 없습니다. 먼저 원본을 발견하세요");
  if (record.status !== "PENDING") throw new Error("이미 시작한 잡입니다");
  record.status = "RUNNING";
  record.startedAt = new Date().toISOString();
  persist();
  return migrationJobView(record);
}

export async function cancelMigrationJob(id: string): Promise<MigrationJob> {
  const data = load();
  const record = findMigration(data, id);
  if (record.status === "COMPLETED") throw new Error("이미 끝난 잡은 취소할 수 없습니다");
  record.status = "CANCELLED";
  record.completedAt = new Date().toISOString();
  persist();
  return migrationJobView(record);
}

/** 폴링 진입점 — 이 호출만 시나리오를 진행시킨다. */
export async function getMigrationJob(id: string): Promise<MigrationJob> {
  const data = load();
  const record = findMigration(data, id);
  if (advanceMigration(record)) persist();
  return migrationJobView(record);
}

/** 보고서는 상태를 읽기만 한다 — 같은 폴링 안에서 잡과 다른 시점을 보면 안 된다. */
export async function getMigrationReport(id: string): Promise<MigrationReport> {
  const data = load();
  const record = findMigration(data, id);
  const job = migrationJobView(record);
  return {
    job,
    itemsByStatus: job.counts.byStatus,
    itemsByStage: job.counts.byStage,
    issues: migrationIssues(record),
    deadLetters: migrationDeadLetters(record),
  };
}

export async function listMigrationItems(
  id: string,
  filter: MigrationItemFilter = {},
): Promise<MigrationItemPage> {
  const data = load();
  const record = findMigration(data, id);
  const matched = record.items.filter(
    (item) =>
      (filter.status === undefined || item.status === filter.status) &&
      (filter.stage === undefined || item.stage === filter.stage),
  );
  const page = Math.max(filter.page ?? 0, 0);
  const size = 50;
  return {
    items: clone(matched.slice(page * size, (page + 1) * size)),
    page,
    size,
    total: matched.length,
  };
}
