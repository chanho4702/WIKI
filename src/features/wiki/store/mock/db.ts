// 목업 저장소 상태 — localStorage(wiki.v1) + 메모리 캐시, 구버전 보정, 공용 헬퍼(복사·id·초안 가시성).
import { createSeedData } from "../../../../mock/seed";
import { CURRENT_USER_ID } from "../../../../mock/users";
import type { Page, WikiData } from "../types";

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

export function load(): WikiData {
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

export function persist(): void {
  if (cache) localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

/** 내부 상태 유출 방지 — 반환값은 항상 깊은 복사본 */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * 초안 가시성(2026-10-18 사용자 결정) — 서버(EffectivePermissionService)와 같은 규칙을 목업도 읽기 경로마다
 * 적용한다(목업이 더 관대하면 화면이 목업에서만 동작한다).
 * - 남의 초안은 그 스페이스 관리자·전역 관리자만 본다. 작성자에게는 그대로 보인다.
 * - 판정은 **조상 체인**에서 한다 — 볼 수 없는 초안 아래의 하위 문서도 함께 가려진다(트리 고아·위치 누출 방지).
 * 목업의 전역 관리자 판정은 getOrgMe와 같다(`org.self`가 없으면 관리자). 스페이스 관리자는 스페이스 권한
 * 원장(`grants`)의 admin — 사용자 직접 부여 또는 내가 속한 팀 부여.
 */
export function canSeePage(data: WikiData, page: Page): boolean {
  const byId = new Map(data.pages.map((p) => [p.id, p]));
  const visited = new Set<string>();
  let cursor: Page | undefined = page;
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    if (cursor.status === "draft" && cursor.createdBy !== CURRENT_USER_ID && !isDraftAdmin(data, cursor.spaceId)) {
      return false;
    }
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
  }
  return true;
}

function isDraftAdmin(data: WikiData, spaceId: string): boolean {
  if ((data.org?.self?.globalRoles ?? ["ADMIN"]).includes("ADMIN")) return true;
  const myTeams = new Set(
    Object.entries(data.teamMembers ?? {})
      .filter(([, members]) => members.includes(CURRENT_USER_ID))
      .map(([teamId]) => teamId),
  );
  return (data.grants?.[spaceId] ?? []).some((g) =>
    g.role === "admin"
    && ((g.subjectType === "user" && g.subjectId === CURRENT_USER_ID) || (g.subjectType === "team" && myTeams.has(g.subjectId))));
}

export function nextId(): string {
  return crypto.randomUUID();
}

/** 테스트 전용: 메모리 캐시를 초기화한다 (localStorage는 건드리지 않음). */
export function __resetForTest(): void {
  cache = null;
}

// ── users ────────────────────────────────────────────────────
