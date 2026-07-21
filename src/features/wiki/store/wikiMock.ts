// 듀얼모드 목업 백엔드 — localStorage(wiki.v1) 기반. VITE_API_BASE 미설정 시 wikiStore가 이 모듈을 사용한다.
import type { Attachment, Comment, Page, PageVersion, Space, User, WikiData } from "./types";
import { CURRENT_USER_ID } from "../../../mock/users";
import { createSeedData } from "../../../mock/seed";

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
    cache = createSeedData();
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
  data.versions.push({
    id: nextId(),
    pageId: page.id,
    version: maxVersion + 1,
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
    title,
    body: input.body ?? "",
    version: 1, // 목업은 낙관적 락을 쓰지 않으므로 항상 1 고정
    position: maxPosition + 1,
    createdBy: CURRENT_USER_ID,
    updatedBy: CURRENT_USER_ID,
    createdAt: now,
    updatedAt: now,
  };
  data.pages.push(page);
  snapshotVersion(data, page, now); // v1 자동 스냅샷
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
): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  const nextTitle = patch.title !== undefined ? patch.title.trim() : page.title;
  if (!nextTitle) throw new Error("페이지 제목을 입력하세요");
  const nextBody = patch.body !== undefined ? patch.body : page.body;
  // 둘 다 무변경이면 no-op — 버전·updatedBy/updatedAt 불변
  if (nextTitle === page.title && nextBody === page.body) {
    return clone(page);
  }
  page.title = nextTitle;
  page.body = nextBody;
  page.updatedBy = CURRENT_USER_ID;
  page.updatedAt = new Date().toISOString();
  snapshotVersion(data, page, page.updatedAt); // 적용 후 내용을 새 버전(max+1)으로
  persist();
  return clone(page);
}

export async function deletePage(id: string): Promise<void> {
  const data = load();
  const index = data.pages.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("페이지를 찾을 수 없습니다");
  if (data.pages.some((p) => p.parentId === id)) {
    throw new Error("하위 페이지가 있어 삭제할 수 없습니다");
  }
  data.pages.splice(index, 1);
  data.versions = data.versions.filter((v) => v.pageId !== id); // 버전 연쇄 삭제
  data.comments = data.comments.filter((c) => c.pageId !== id); // 코멘트 연쇄 삭제
  persist();
}

export async function movePage(
  id: string,
  target: { parentId: string | null; beforeId?: string | null },
): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
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
  const comment: Comment = {
    id: nextId(),
    pageId,
    authorId: CURRENT_USER_ID,
    body: trimmed,
    parentId: resolvedParentId,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
  data.comments.push(comment);
  persist();
  return clone(comment);
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

export async function uploadAttachment(_pageId: string, _file: File): Promise<Attachment> {
  throw new Error("목업 모드에서는 첨부를 지원하지 않습니다");
}

export function attachmentUrl(_id: string): string {
  return "";
}

export async function deleteAttachment(_id: string): Promise<void> {
  // no-op
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
