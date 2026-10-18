// 페이지 제한(W18, V12 계약)(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { toBackendId } from "../mapping";
import type { PageRestrictions, RestrictionPrincipal } from "../types";
import { json } from "./http";

export interface RestrictionPrincipalDto { type: string; id: number }

interface RestrictionsDto {
  view: RestrictionPrincipalDto[];
  edit: RestrictionPrincipalDto[];
  inherited: Array<{ pageId: number; pageTitle: string; principals: RestrictionPrincipalDto[] }>;
}

export function mapPrincipal(p: RestrictionPrincipalDto): RestrictionPrincipal {
  return { type: p.type === "TEAM" ? "team" : "user", id: String(p.id) };
}

function mapRestrictions(dto: RestrictionsDto): PageRestrictions {
  return {
    view: dto.view.map(mapPrincipal),
    edit: dto.edit.map(mapPrincipal),
    inherited: dto.inherited.map((i) => ({
      pageId: String(i.pageId),
      pageTitle: i.pageTitle,
      principals: i.principals.map(mapPrincipal),
    })),
  };
}

function toPrincipalDto(p: RestrictionPrincipal) {
  return { type: p.type === "team" ? "TEAM" : "USER", id: toBackendId(p.id) };
}

export async function getPageRestrictions(pageId: string): Promise<PageRestrictions> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/restrictions`);
  return mapRestrictions(await json<RestrictionsDto>(res));
}

export async function setPageRestrictions(
  pageId: string,
  input: { view: RestrictionPrincipal[]; edit: RestrictionPrincipal[] },
): Promise<PageRestrictions> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/restrictions`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ view: input.view.map(toPrincipalDto), edit: input.edit.map(toPrincipalDto) }),
  });
  return mapRestrictions(await json<RestrictionsDto>(res));
}
