// 라벨·백링크(W21-2) 목업.
import { WIKI_LINK_SOURCE } from "../../lib/wikiLinks";
import type { LabelCount, Page } from "../types";
import { canSeePage, clone, load, persist } from "./db";

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
    if (!canSeePage(data, page)) continue; // 숨은 초안의 라벨은 이름도 건수도 새면 안 된다
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

export async function listSpaceLabels(spaceId: string): Promise<LabelCount[]> {
  const data = load();
  const counts = new Map<string, number>();
  for (const page of data.pages.filter((p) => p.spaceId === spaceId && canSeePage(data, p))) {
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
    .filter((p) => p.spaceId === spaceId && (data.labels?.[p.id] ?? []).includes(target) && canSeePage(data, p))
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
    .filter((p) => p.spaceId === page.spaceId && p.id !== pageId && canSeePage(data, p))
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
