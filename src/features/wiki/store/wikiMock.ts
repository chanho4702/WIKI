// 듀얼모드 목업 백엔드 — localStorage(wiki.v1) 기반. VITE_API_BASE 미설정 시 wikiStore가 이 모듈을 사용한다.
import { PageConflictError } from "./types";
import type {
  Attachment,
  Comment,
  DeletePageOptions,
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
} from "./types";
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
  // type/status 도입(2026-07-26) 이전에 저장된 문서 — 전부 게시된 일반 페이지였다.
  for (const page of data.pages) {
    page.type ??= "page";
    page.status ??= "published";
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
  page.title = nextTitle;
  page.body = nextBody;
  page.updatedBy = CURRENT_USER_ID;
  page.updatedAt = new Date().toISOString();
  snapshotVersion(data, page, page.updatedAt); // 적용 후 내용을 새 버전(max+1)으로
  persist();
  return clone(page);
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

  data.pages = data.pages.filter((p) => !doomed.has(p.id));
  data.versions = data.versions.filter((v) => !doomed.has(v.pageId)); // 버전 연쇄 삭제
  data.comments = data.comments.filter((c) => !doomed.has(c.pageId)); // 코멘트 연쇄 삭제
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

export async function uploadAttachment(
  _pageId: string,
  _file: File,
  _options?: import("./types").AttachmentUploadOptions,
): Promise<Attachment> {
  throw new Error("목업 모드에서는 첨부를 지원하지 않습니다");
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
  if (!query) return { total: 0, tookMs: 0, hits: [] };

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
