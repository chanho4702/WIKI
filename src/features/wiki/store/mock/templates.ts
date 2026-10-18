// 페이지 템플릿(W23) 목업.
import type { PageTemplate, TemplateInput } from "../types";
import { load, nextId, persist } from "./db";

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
