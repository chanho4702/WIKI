// 스페이스·스페이스 권한·개인 스페이스 목업.
import { CURRENT_USER_ID } from "../../../../mock/users";
import type { Space, SpaceGrant } from "../types";
import { clone, load, nextId, persist } from "./db";
import { normalizeLabel } from "./labels";

export async function listSpaces(): Promise<Space[]> {
  // 백엔드 어댑터와 같이 라벨은 언제나 배열 — 화면이 두 모드에서 같은 모양을 본다.
  return clone(load().spaces).map((space) => ({ ...space, labels: [...(space.labels ?? [])].sort() }));
}

/** 스페이스 라벨 상한 — 백엔드 SpaceService.MAX_LABELS_PER_SPACE와 같다. */
const MAX_SPACE_LABELS = 10;

/** 스페이스 라벨 전량 교체(V41) — 백엔드와 같은 정규화·중복 접기·이름순·상한. */
export async function setSpaceLabels(spaceId: string, raw: string[]): Promise<Space> {
  const data = load();
  const space = data.spaces.find((s) => s.id === spaceId);
  if (!space) throw new Error("스페이스를 찾을 수 없습니다");
  const names = [...new Set(raw.map(normalizeLabel))].sort();
  if (names.length > MAX_SPACE_LABELS) {
    throw new Error(`스페이스 라벨은 ${MAX_SPACE_LABELS}개까지입니다`);
  }
  space.labels = names;
  persist();
  return clone({ ...space, labels: names });
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
