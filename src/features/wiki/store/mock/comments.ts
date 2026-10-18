// 댓글·인라인 댓글 목업.
import { CURRENT_USER_ID } from "../../../../mock/users";
import { byCreatedAsc } from "../../lib/commentOrder";
import type { Comment, CommentAnchor, CommentKind, CommentThreadPage } from "../types";
import { clone, load, nextId, persist } from "./db";
import { autoWatch, notifyCommentAdded } from "./notifications";
import { summarizeReactions } from "./personal";

/** 백엔드 CommentService.listThreads와 같은 상한·기본값. */
const THREAD_PAGE_DEFAULT = 20;

const THREAD_PAGE_MAX = 100;

/** 백엔드와 같은 키셋 순서 — 작성 시각 내림차순, 같으면 id 내림차순. */
function compareThreadDesc(a: Comment, b: Comment): number {
  return byCreatedAsc(b, a);
}

/**
 * 스레드 한 쪽 — 커서 모양은 목업 전용(`작성시각~id`)이지만 화면에는 불투명한 문자열이라 상관없다.
 * 깨진 커서는 백엔드처럼 거부한다(첫 쪽으로 조용히 되돌리지 않는다).
 */
export async function listCommentThreads(
  pageId: string,
  options: { kind?: CommentKind; before?: string | null; limit?: number } = {},
): Promise<CommentThreadPage> {
  const data = load();
  const kind = options.kind ?? "page";
  const size = Math.max(1, Math.min(options.limit ?? THREAD_PAGE_DEFAULT, THREAD_PAGE_MAX));
  const ofPage = data.comments.filter((c) => c.pageId === pageId);
  const roots = ofPage
    .filter((c) => c.parentId === null && (c.anchorType ?? "page") === kind)
    .sort(compareThreadDesc);
  let rest = roots;
  if (options.before) {
    const tilde = options.before.lastIndexOf("~");
    const at = tilde < 0 ? "" : options.before.slice(0, tilde);
    const id = tilde < 0 ? "" : options.before.slice(tilde + 1);
    if (!at || !id || Number.isNaN(Date.parse(at))) {
      throw new Error(`댓글 목록 커서가 올바르지 않습니다: ${options.before}`);
    }
    const cursor = { createdAt: at, id } as Comment;
    rest = roots.filter((c) => compareThreadDesc(c, cursor) > 0);
  }
  const page = rest.slice(0, size);
  const rootIds = new Set(roots.map((c) => c.id));
  const pageIds = new Set(page.map((c) => c.id));
  const replies = ofPage
    .filter((c) => c.parentId !== null && pageIds.has(c.parentId))
    .sort(byCreatedAsc);
  const last = page[page.length - 1];
  return {
    comments: clone([...page, ...replies]).map((c) => ({
      ...c,
      reactions: summarizeReactions(data, `COMMENT:${c.id}`),
    })),
    nextBefore: rest.length > size && last ? `${last.createdAt}~${last.id}` : null,
    threadCount: roots.length,
    commentCount: roots.length + ofPage.filter((c) => c.parentId !== null && rootIds.has(c.parentId)).length,
  };
}

export async function listComments(pageId: string): Promise<Comment[]> {
  const data = load();
  return clone(
    data.comments
      .filter((c) => c.pageId === pageId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ ...c, reactions: summarizeReactions(data, `COMMENT:${c.id}`) })),
  );
}

/* ── 액션 아이템(W23) — 본문에서 매번 파싱한다(목업은 파생 표가 없다) ── */

export async function addComment(
  pageId: string,
  body: string,
  parentId?: string | null,
  anchor?: CommentAnchor | null,
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
  if (anchor && resolvedParentId !== null) {
    throw new Error("답글에는 본문 구간을 붙일 수 없습니다");
  }
  if (anchor && anchor.occurrence < 0) {
    throw new Error("본문 구간 위치가 올바르지 않습니다");
  }
  const comment: Comment = {
    id: nextId(),
    pageId,
    authorId: CURRENT_USER_ID,
    body: trimmed,
    parentId: resolvedParentId,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    anchorType: anchor ? "inline" : "page",
    anchorQuote: anchor ? anchor.quote : null,
    anchorOccurrence: anchor ? anchor.occurrence : null,
    resolvedAt: null,
  };
  data.comments.push(comment);
  autoWatch(data, pageId, CURRENT_USER_ID); // 댓글을 달면 그 대화에 참여한 것이다(W21-4)
  const page = data.pages.find((p) => p.id === pageId);
  if (page) notifyCommentAdded(data, page, trimmed);
  persist();
  return clone(comment);
}

/** 해결/재개(W21-4) — 인라인 스레드만 대상. 본인이 아니어도 닫을 수 있다(컨플루언스 규칙). */
export async function setCommentResolved(id: string, resolved: boolean): Promise<Comment> {
  const data = load();
  const comment = data.comments.find((c) => c.id === id);
  if (!comment) throw new Error("코멘트를 찾을 수 없습니다");
  if (comment.anchorType !== "inline") throw new Error("인라인 댓글만 해결할 수 있습니다");
  comment.resolvedAt = resolved ? new Date().toISOString() : null;
  persist();
  return clone(comment);
}

/* ── 구독(W21-4) ─────────────────────────────────────────── */

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

// ── 마이그레이션(M1, 컨플루언스 DC) ────────────────────────────
/*
 * 목업은 **고정 시나리오**다(설계 §2). 실제로 DC에 붙지 않고, 화면이 파이프라인 한 바퀴를
 * — 연결 확인 → 잡 생성 → 발견 → 시작 → 진행 → 보고서 → 데드레터 — 끝까지 그릴 수 있는
 * 만큼만 흉내낸다.
 *
 * 진행은 시간이 아니라 **폴링 횟수**로 움직인다. 목업에 타이머를 두면 테스트가 실제 시계를
 * 기다려야 하고, 느린 CI에서 몇 틱이 지났는지가 달라져 결과가 흔들린다. getMigrationJob을
 * 부를 때마다 3건씩 나아가고, 보고서 조회는 상태를 **읽기만** 한다 — 한 번의 폴링에서 잡과
 * 보고서를 같이 읽는 화면이 서로 다른 시점을 보면 안 되기 때문이다.
 */
