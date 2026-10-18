// 스페이스·스페이스 권한·개인 스페이스(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { mapSpace, toBackendId } from "../mapping";
import type { Space, SpaceGrant } from "../types";
import { json } from "./http";

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

/** 스페이스 라벨 전량 교체(V41) — 서버가 스페이스 ADMIN만 허용하고 정규화·정렬한 결과를 준다. */
export async function setSpaceLabels(spaceId: string, labels: string[]): Promise<Space> {
  const res = await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/labels`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ labels }),
  });
  return mapSpace(await json(res));
}

/** 되돌릴 수 없다 — 페이지·첨부·이력까지 함께 사라진다(서버가 스페이스 ADMIN만 허용). */
export async function deleteSpace(spaceId: string): Promise<void> {
  await json(await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}`, { method: "DELETE" }));
}

/** 내 개인 스페이스 — 없으면 서버가 만든다(멱등). */
export async function ensurePersonalSpace(): Promise<Space> {
  return mapSpace(await json(await sharedApiFetch("/api/wiki/spaces/personal", { method: "POST" })));
}
