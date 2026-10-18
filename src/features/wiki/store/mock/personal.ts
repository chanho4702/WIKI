// 별표·최근 방문·내 작업·리액션 목업.
import { CURRENT_USER_ID } from "../../../../mock/users";
import { type ParsedTask, parseTasks, toggleTaskLine } from "../../lib/tasks";
import { type MyTask, type Page, REACTION_EMOJIS, type ReactionSummary, type WikiData } from "../types";
import { canSeePage, load, persist } from "./db";
import { updatePage } from "./pages";

export async function listMyTasks(done: boolean): Promise<MyTask[]> {
  const data = load();
  const spaces = new Map(data.spaces.map((s) => [s.id, s]));
  const out: MyTask[] = [];
  for (const page of data.pages) {
    if (page.archivedAt || !canSeePage(data, page)) continue;
    for (const t of parseTasks(page.body)) {
      if (t.assigneeId !== CURRENT_USER_ID || t.done !== done) continue;
      out.push({
        pageId: page.id,
        spaceId: page.spaceId,
        spaceName: spaces.get(page.spaceId)?.name ?? null,
        pageTitle: page.title,
        ...t,
      });
    }
  }
  // 백엔드와 같은 순서 — 기한 있는 것이 먼저(임박한 순), 없는 것은 뒤
  return out.sort((a, b) => {
    if (a.dueDate === null && b.dueDate !== null) return 1;
    if (a.dueDate !== null && b.dueDate === null) return -1;
    return (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || a.pageId.localeCompare(b.pageId) || a.lineNo - b.lineNo;
  });
}

export async function setTaskDone(pageId: string, lineNo: number, done: boolean): Promise<MyTask> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  if (page.archivedAt) throw new Error("보관된 문서는 편집할 수 없습니다. 먼저 보관을 해제하세요");
  const next = toggleTaskLine(page.body, lineNo, done);
  if (next === null) throw new Error("그 줄은 더 이상 작업 항목이 아닙니다. 문서를 새로고침하세요");
  // 편집이다 — 버전·리비전이 따라간다(updatePage와 같은 경로)
  await updatePage(pageId, { body: next }, { changeNote: done ? "작업 완료 표시" : "작업 다시 열기" });
  const refreshed = load().pages.find((p) => p.id === pageId) as Page;
  const task = parseTasks(refreshed.body).find((t) => t.lineNo === lineNo) as ParsedTask;
  return {
    pageId,
    spaceId: refreshed.spaceId,
    spaceName: load().spaces.find((s) => s.id === refreshed.spaceId)?.name ?? null,
    pageTitle: refreshed.title,
    ...task,
  };
}

/* ── 리액션(W23) — 백엔드와 같은 규칙: 고정 집합, 사용자·이모지당 하나, 집합 순서로 집계 ── */

export function summarizeReactions(data: WikiData, key: string): ReactionSummary[] {
  const byUser = data.reactions?.[key] ?? {};
  return REACTION_EMOJIS.flatMap((emoji) => {
    const users = Object.entries(byUser).filter(([, emojis]) => emojis.includes(emoji)).map(([u]) => u);
    return users.length === 0
      ? []
      : [{ emoji, count: users.length, reacted: users.includes(CURRENT_USER_ID) }];
  });
}

function setReaction(key: string, emoji: string, on: boolean): ReactionSummary[] {
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
    throw new Error(`지원하지 않는 리액션입니다: ${emoji}`);
  }
  const data = load();
  data.reactions ??= {};
  data.reactions[key] ??= {};
  const mine = new Set(data.reactions[key][CURRENT_USER_ID] ?? []);
  if (on) mine.add(emoji);
  else mine.delete(emoji);
  data.reactions[key][CURRENT_USER_ID] = [...mine];
  persist();
  return summarizeReactions(data, key);
}

export async function listPageReactions(pageId: string): Promise<ReactionSummary[]> {
  const data = load();
  if (!data.pages.some((p) => p.id === pageId)) throw new Error("페이지를 찾을 수 없습니다");
  return summarizeReactions(data, `PAGE:${pageId}`);
}

export async function setPageReaction(pageId: string, emoji: string, on: boolean): Promise<ReactionSummary[]> {
  if (!load().pages.some((p) => p.id === pageId)) throw new Error("페이지를 찾을 수 없습니다");
  return setReaction(`PAGE:${pageId}`, emoji, on);
}

export async function setCommentReaction(commentId: string, emoji: string, on: boolean): Promise<ReactionSummary[]> {
  if (!load().comments.some((c) => c.id === commentId)) throw new Error("코멘트를 찾을 수 없습니다");
  return setReaction(`COMMENT:${commentId}`, emoji, on);
}

/**
 * 목업에는 서버 원장이 없다 — null로 그 사실을 알린다.
 *
 * 빈 목록을 주면 동기화가 브라우저에 있던 별표를 지운다. "서버에 없다"와 "서버가 없다"는
 * 다른 말이고, 이 구분을 흐리면 목업 모드에서 별표가 사라진다.
 */
export async function listStars(): Promise<null> {
  return null;
}

export async function setPageStar(_pageId: string, _starred: boolean): Promise<void> {
  // 목업은 브라우저 저장소가 곧 원장이다(lib/starredPages) — 여기서 더 할 일이 없다.
}

export async function setSpaceStar(_spaceId: string, _starred: boolean): Promise<void> {
  // setPageStar와 같은 이유.
}

export async function listRecentPages(_limit?: number): Promise<null> {
  return null; // 최근 방문도 브라우저 기록(lib/recentVisits)이 원장이다
}
