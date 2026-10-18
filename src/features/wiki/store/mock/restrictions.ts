// 페이지 제한(W18) 목업 — 저장·상속 표시만 담당한다.
import type { PageRestrictions, RestrictionPrincipal } from "../types";
import { clone, load, persist } from "./db";

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
