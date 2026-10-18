// 페이지 템플릿(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { toBackendId } from "../mapping";
import type { PageTemplate, TemplateInput } from "../types";
import { json } from "./http";

function mapTemplate(dto: {
  id: number | string;
  spaceId: number | string;
  name: string;
  description: string | null;
  icon: string | null;
  content: string;
  updatedAt: string | null;
}): PageTemplate {
  return {
    id: String(dto.id),
    spaceId: String(dto.spaceId),
    name: dto.name,
    description: dto.description ?? null,
    icon: dto.icon ?? null,
    content: dto.content ?? "",
    updatedAt: dto.updatedAt ?? null,
  };
}

export async function listTemplates(spaceId: string): Promise<PageTemplate[]> {
  const rows = await json<Parameters<typeof mapTemplate>[0][]>(
    await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/templates`));
  return rows.map(mapTemplate);
}

export async function createTemplate(spaceId: string, input: TemplateInput): Promise<PageTemplate> {
  return mapTemplate(await json(await sharedApiFetch(
    `/api/wiki/spaces/${toBackendId(spaceId)}/templates`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })));
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<PageTemplate> {
  return mapTemplate(await json(await sharedApiFetch(
    `/api/wiki/templates/${toBackendId(id)}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })));
}

export async function deleteTemplate(id: string): Promise<void> {
  await sharedApiFetch(`/api/wiki/templates/${toBackendId(id)}`, { method: "DELETE" });
}

/** 지금 있는 페이지를 템플릿으로 — 이름을 생략하면 서버가 그 페이지 제목을 쓴다. */
export async function savePageAsTemplate(pageId: string, name?: string): Promise<PageTemplate> {
  return mapTemplate(await json(await sharedApiFetch(
    `/api/wiki/pages/${toBackendId(pageId)}/save-as-template`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(name ? { name } : {}),
    })));
}
