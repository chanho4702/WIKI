import { Fragment, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import {
  Avatar,
  Button,
  Comment as CommentBlock,
  ConfirmDialog,
  TextArea,
  useToast,
} from "@chanho/react";
import type { CommentAction } from "@chanho/react";
import { MessageSquare } from "lucide-react";
import { CommentSkeleton } from "./WikiSkeleton";
import type { Comment, User } from "../store/types";
import {
  addComment,
  deleteComment,
  getCurrentUser,
  listCommentThreads,
  setCommentReaction,
  updateComment,
} from "../store/wikiStore";
import type { CommentThreadPage } from "../store/types";
import { byCreatedAsc } from "../lib/commentOrder";
import { ReactionBar } from "./ReactionBar";
import { useReadOnly } from "../lib/readOnly";

export interface CommentSectionProps {
  pageId: string;
  /** 작성자 이름 표시용 — PageViewPage가 이미 로드한 목록 재사용 */
  users: User[];
}

/**
 * 상대 시각 — DS Comment.time의 의도된 형태("3시간 전")다. 전체 타임스탬프를 그대로 붙이면
 * 목록이 숫자 잡음으로 덮인다(휴리스틱 #8). 일주일이 넘으면 상대값이 오히려 모호해져 날짜로 바꾼다.
 */
export function formatCommentTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const diffMs = now.getTime() - at.getTime();
  if (!Number.isFinite(diffMs)) return "";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return at.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

/** 삭제 확인 대기 상태 — 브라우저 confirm 대신 DS 다이얼로그를 쓴다(휴리스틱 #4 일관성). */
interface PendingDelete {
  comment: Comment;
  replyCount: number;
}

/** 한 번에 읽는 스레드 수 — 댓글이 수천 개인 문서도 첫 화면은 이만큼이다. */
export const COMMENT_THREAD_PAGE = 20;


/**
 * 최신 쪽을 다시 받아 지금 들고 있는 스레드에 합친다.
 *
 * 최신 쪽에 든 스레드는 서버 것으로 통째로 갈아끼우고(남이 단 답글·고친 본문 반영), 그 범위 안인데
 * 서버에 없는 스레드는 지워진 것이다. 그보다 오래된, 사용자가 "더 보기"로 읽어 둔 스레드는 그대로
 * 둔다. 최신 쪽과 들고 있던 범위 사이에 빈틈이 생겼으면(그 사이 남이 한 쪽 넘게 썼다) 최신 쪽으로
 * 다시 시작한다 — 빈틈을 둔 채 "이전 코멘트" 커서를 잇면 그 사이 스레드에 닿을 길이 없다.
 */
function mergeLatest(
  current: { comments: Comment[]; nextBefore: string | null },
  fresh: CommentThreadPage,
): { comments: Comment[]; nextBefore: string | null } {
  const freshRoots = fresh.comments.filter((c) => c.parentId === null);
  const oldestFresh = [...freshRoots].sort(byCreatedAsc)[0];
  const currentRoots = current.comments.filter((c) => c.parentId === null).sort(byCreatedAsc);
  const newestCurrent = currentRoots[currentRoots.length - 1];
  const gap =
    fresh.nextBefore !== null &&
    oldestFresh !== undefined &&
    newestCurrent !== undefined &&
    byCreatedAsc(newestCurrent, oldestFresh) < 0 &&
    !freshRoots.some((r) => r.id === newestCurrent.id);
  // 최신 쪽이 끝까지 다 담았거나(nextBefore=null — 서버에 그 밖의 스레드가 없다) 들고 있던 것이 없으면
  // 최신 쪽이 곧 전부다. 옛 스레드를 남기면 다른 곳에서 지운 댓글이 화면에 남는다.
  if (gap || fresh.nextBefore === null || oldestFresh === undefined || newestCurrent === undefined) {
    return { comments: fresh.comments, nextBefore: fresh.nextBefore };
  }
  // 최신 쪽 범위(가장 오래된 최신 스레드 이후)에 드는 옛 스레드는 버리고 서버 것으로 바꾼다.
  const keptRootIds = new Set(
    currentRoots.filter((r) => byCreatedAsc(r, oldestFresh) < 0).map((r) => r.id),
  );
  const kept = current.comments.filter((c) => keptRootIds.has(c.parentId ?? c.id));
  return { comments: [...kept, ...fresh.comments], nextBefore: current.nextBefore };
}

/**
 * 페이지 하단 코멘트 — 최상위 목록 + 답글 1단 + 본인 수정/삭제.
 *
 * 스레드는 쪽 단위로 읽는다(최신 스레드부터). 화면은 오래된 순으로 그리므로 더 읽을 것은 언제나
 * **위쪽**이다 — "이전 코멘트 더 보기"가 목록 위에 있고, 새 댓글은 이미 읽은 범위 끝에 붙어 빈틈이
 * 생기지 않는다.
 */
export function CommentSection({ pageId, users }: CommentSectionProps) {
  const readOnly = useReadOnly();
  // null = 로딩 중. 스레드와 "더 오래된 쪽" 커서는 함께 바뀌어야 해서 한 상태로 둔다.
  const [threads, setThreads] = useState<{ comments: Comment[]; nextBefore: string | null } | null>(null);
  const comments = threads?.comments ?? null;
  const nextBefore = threads?.nextBefore ?? null;
  /** 지금의 "더 오래된 쪽" 커서 — 늦게 온 응답이 아직 유효한지 then 안에서 확인한다 */
  const cursorRef = useRef<string | null>(null);
  cursorRef.current = nextBefore;
  /** 쓰기 세대 — 작성·수정·삭제와 그 뒤 재조회마다 오른다. 그 전에 나간 "이전 코멘트" 응답을 가린다. */
  const writeEpoch = useRef(0);
  const [counts, setCounts] = useState({ threadCount: 0, commentCount: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  /** pageId가 바뀌면 늦게 도착한 이전 문서의 응답을 버린다 */
  const generation = useRef(0);
  const [me, setMe] = useState<User | null>(null);
  const [draft, setDraft] = useState("");
  const [composerActive, setComposerActive] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  useEffect(() => {
    // 익명 인스턴스는 로그인 사용자가 없다 — /api/me를 부르면 401 + refresh 401이 나가고
    // 처리되지 않은 rejection으로 남는다(WikiTopBar와 같은 규칙). 실패도 삼킨다.
    if (readOnly) return;
    void getCurrentUser()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    const mine = ++generation.current;
    setThreads(null);
    setLoadError(null);
    setOlderError(null);
    setLoadingOlder(false);
    setDraft("");
    setComposerActive(false);
    setReplyTo(null);
    setEditingId(null);
    setPendingDelete(null);
    void listCommentThreads(pageId, { kind: "page", limit: COMMENT_THREAD_PAGE })
      .then((first) => {
        if (generation.current !== mine) return;
        setThreads({ comments: first.comments, nextBefore: first.nextBefore });
        setCounts({ threadCount: first.threadCount, commentCount: first.commentCount });
      })
      .catch((error: unknown) => {
        // 빈 목록으로 삼키지 않는다 — "코멘트가 없다"와 "못 읽었다"는 다르다
        if (generation.current === mine) setLoadError(error instanceof Error ? error.message : String(error));
      });
  }, [pageId]);

  /** 쓰기 뒤 최신 쪽을 다시 받아 합친다 — 남이 그 사이 단 댓글도 함께 들어온다. */
  const reload = async () => {
    writeEpoch.current += 1; // 쓰기 뒤의 재조회다 — 그 전에 나간 "이전 코멘트" 응답의 건수는 낡았다
    const mine = generation.current;
    const fresh = await listCommentThreads(pageId, { kind: "page", limit: COMMENT_THREAD_PAGE });
    if (generation.current !== mine) return;
    setCounts({ threadCount: fresh.threadCount, commentCount: fresh.commentCount });
    setThreads((prev) => mergeLatest(prev ?? { comments: [], nextBefore: null }, fresh));
  };

  /**
   * 쓰기 결과를 들고 있는 목록에 바로 반영한다. 최신 쪽 재조회(reload)는 "더 보기"로 읽어 둔 옛
   * 스레드를 다시 받지 않으므로, 옛 스레드의 답글·수정·삭제는 여기서 맞춰야 화면에 남는다.
   */
  const applyLocal = (change: (list: Comment[]) => Comment[]) => {
    writeEpoch.current += 1;
    setThreadsLocal(change);
  };
  const setThreadsLocal = (change: (list: Comment[]) => Comment[]) =>
    setThreads((prev) => (prev ? { ...prev, comments: change(prev.comments) } : prev));

  /** 쓰기 때문에 늦은 "이전 코멘트" 응답을 버리고 다시 읽는 횟수 상한 — 넘으면 다시 시도를 맡긴다 */
  const OLDER_RETRIES = 3;

  const loadOlder = () => {
    if (nextBefore === null || loadingOlder) return;
    const mine = generation.current;
    setLoadingOlder(true);
    setOlderError(null);

    /**
     * 요청이 나가 있는 동안 이 화면에서 쓰기(작성·수정·삭제와 그 뒤 재조회)가 있었으면 그 응답은 쓰기 전
     * 세계의 것이다 — 어떤 스레드가 지워졌는지·갈아끼워졌는지를 하나씩 따져 거르는 대신 **통째로 버리고**
     * 지금의 커서로 다시 읽는다. 목록이 다시 세워져 커서가 바뀌었으면 그 응답은 옛 자리의 것이라 버린다.
     */
    const fetchOlder = (cursor: string, attempt: number): Promise<void> => {
      const epoch = writeEpoch.current;
      return listCommentThreads(pageId, { kind: "page", before: cursor, limit: COMMENT_THREAD_PAGE }).then(
        (older) => {
          if (generation.current !== mine || cursorRef.current !== cursor) return;
          if (writeEpoch.current !== epoch) {
            if (attempt + 1 >= OLDER_RETRIES) {
              throw new Error("코멘트가 바뀌는 중이라 이전 코멘트를 불러오지 못했습니다");
            }
            return fetchOlder(cursor, attempt + 1);
          }
          setThreads((prev) => {
            if (!prev || prev.nextBefore !== cursor) return prev;
            const have = prev.comments;
            // 응답과 들고 있는 것은 같은 시점이지만, 겹치는 스레드가 있으면 들고 있는 쪽을 둔다(이중 방어).
            const heldRoots = new Set(have.filter((c) => c.parentId === null).map((c) => c.id));
            const fresh = older.comments.filter((c) => !heldRoots.has(c.parentId ?? c.id));
            return { comments: [...fresh, ...have], nextBefore: older.nextBefore };
          });
          setCounts({ threadCount: older.threadCount, commentCount: older.commentCount });
        },
      );
    };

    void fetchOlder(nextBefore, 0)
      .catch((error: unknown) => {
        if (generation.current === mine) setOlderError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (generation.current === mine) setLoadingOlder(false);
      });
  };
  // 이름 해석: users 목록(목업/디렉터리) → 서버 스냅샷(백엔드 모드) → "알 수 없음"
  const userName = (id: string, snapshot?: string) =>
    users.find((u) => u.id === id)?.name ?? snapshot ?? "알 수 없음";
  const fail = (title: string, error: unknown) =>
    toast({
      title,
      description: error instanceof Error ? error.message : String(error),
      appearance: "danger",
    });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await addComment(pageId, draft); // 빈 본문은 스토어가 throw
      setDraft("");
      setComposerActive(false);
      await reload();
      toast({ title: "코멘트를 남겼습니다", appearance: "success" });
    } catch (error) {
      fail("코멘트 작성 실패", error);
    }
  };

  const handleReplySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!replyTo) return;
    try {
      const reply = await addComment(pageId, replyDraft, replyTo);
      applyLocal((list) => (list.some((c) => c.id === reply.id) ? list : [...list, reply]));
      setReplyDraft("");
      setReplyTo(null);
      await reload();
      toast({ title: "답글을 남겼습니다", appearance: "success" });
    } catch (error) {
      fail("답글 작성 실패", error);
    }
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    try {
      const edited = await updateComment(editingId, editDraft);
      applyLocal((list) => list.map((c) => (c.id === edited.id ? { ...c, ...edited, reactions: c.reactions } : c)));
      setEditingId(null);
      await reload();
      toast({ title: "코멘트를 수정했습니다", appearance: "success" });
    } catch (error) {
      fail("코멘트 수정 실패", error);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const doomed = pendingDelete.comment.id;
      await deleteComment(doomed);
      applyLocal((list) => list.filter((c) => c.id !== doomed && c.parentId !== doomed));
      setPendingDelete(null);
      await reload();
      toast({ title: "코멘트를 삭제했습니다", appearance: "success" });
    } catch (error) {
      fail("코멘트 삭제 실패", error);
    } finally {
      setDeleting(false);
    }
  };

  /** Ctrl(⌘)+Enter 제출 — 폼의 requestSubmit으로 위 submit 핸들러를 태운다(숙련자 경로, 휴리스틱 #7). */
  const submitOnCtrlEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  if (loadError !== null) {
    return (
      <section className="comment-section" aria-label="코멘트">
        <h2 className="comment-section-title">코멘트</h2>
        <p className="comment-load-error" role="alert">
          코멘트를 불러오지 못했습니다: {loadError}
        </p>
      </section>
    );
  }
  if (comments === null) {
    return <CommentSkeleton label="코멘트 로딩 중" />;
  }

  // 인라인 스레드(W21-4)는 본문 옆 InlineCommentLayer가 맡는다 — 서버가 kind=page만 준다.
  const topLevel = comments.filter((c) => c.parentId === null && c.anchorType !== "inline").sort(byCreatedAsc);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id).sort(byCreatedAsc);
  const unloadedThreads = Math.max(0, counts.threadCount - topLevel.length);

  /**
   * DS Comment의 actions prop으로 하단 액션을 구성한다.
   * replies가 null이면 답글(들여쓰기 항목) — 답글 액션을 넣지 않는다.
   * 수정/삭제는 본인 코멘트에만, 삭제는 danger로 강조된다.
   */
  const actionsFor = (comment: Comment, replies: Comment[] | null): CommentAction[] => {
    const actions: CommentAction[] = [];
    // 읽기 전용에서는 답글·수정·삭제가 전부 없다 — 액션 줄 자체가 사라진다
    if (readOnly) return actions;
    if (replies !== null) {
      actions.push({
        label: "답글",
        onClick: () => {
          setReplyTo(comment.id);
          setReplyDraft("");
        },
      });
    }
    if (comment.authorId === me?.id) {
      actions.push({
        label: "수정",
        onClick: () => {
          setEditingId(comment.id);
          setEditDraft(comment.body);
        },
      });
      actions.push({
        label: "삭제",
        danger: true,
        onClick: () => setPendingDelete({ comment, replyCount: replies?.length ?? 0 }),
      });
    }
    return actions;
  };

  /** replies가 null이면 답글 — nested 들여쓰기로 렌더하고 하위 목록/답글 폼을 붙이지 않는다 */
  const renderComment = (comment: Comment, replies: Comment[] | null) => {
    const editing = editingId === comment.id;
    const name = userName(comment.authorId, comment.authorName);
    return (
      <Fragment key={comment.id}>
        <CommentBlock
          author={name}
          avatar={<Avatar name={name} size="small" />}
          time={formatCommentTime(comment.createdAt) + (comment.updatedAt ? " (수정됨)" : "")}
          nested={replies === null}
          actions={editing ? undefined : actionsFor(comment, replies)}
        >
          {editing ? (
            <div className="comment-edit">
              <TextArea
                label="코멘트 수정"
                rows={2}
                value={editDraft}
                autoFocus
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  submitOnCtrlEnter(e);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
              <div className="comment-actions">
                <Button size="small" onClick={handleEditSave}>
                  저장
                </Button>
                <Button size="small" variant="subtle" onClick={() => setEditingId(null)}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <>
              <span data-testid="comment-body">{comment.body}</span>
              {readOnly ? null : (
                <ReactionBar
                  label="댓글 리액션"
                  reactions={comment.reactions ?? []}
                  onToggle={async (emoji, on) => {
                    const reactions = await setCommentReaction(comment.id, emoji, on);
                    // 칩 상태는 ReactionBar가 들고 있지만, 수정 뒤 다시 그릴 때는 목록의 값을 쓴다
                    applyLocal((list) => list.map((c) => (c.id === comment.id ? { ...c, reactions } : c)));
                    return reactions;
                  }}
                />
              )}
            </>
          )}
        </CommentBlock>
        {replies !== null && replies.length > 0 ? (
          <div className="comment-thread" data-testid="comment-replies">
            {replies.map((reply) => renderComment(reply, null))}
          </div>
        ) : null}
        {replies !== null && replyTo === comment.id ? (
          <form className="comment-composer comment-composer--reply" onSubmit={handleReplySubmit}>
            <Avatar name={me?.name ?? "나"} size="small" />
            <div className="comment-composer-main">
              <TextArea
                label="답글 작성"
                rows={2}
                placeholder={`${name}님에게 답글 남기기`}
                value={replyDraft}
                autoFocus
                onChange={(e) => setReplyDraft(e.target.value)}
                onKeyDown={(e) => {
                  submitOnCtrlEnter(e);
                  if (e.key === "Escape") setReplyTo(null);
                }}
              />
              <div className="comment-actions">
                <Button type="submit" size="small">
                  답글 남기기
                </Button>
                <Button size="small" variant="subtle" onClick={() => setReplyTo(null)}>
                  취소
                </Button>
                <span className="comment-hint">Ctrl+Enter로 저장</span>
              </div>
            </div>
          </form>
        ) : null}
      </Fragment>
    );
  };

  const composerExpanded = composerActive || draft.length > 0;

  return (
    <section className="comment-section" aria-label="코멘트">
      <h2 className="comment-section-title">코멘트 ({counts.commentCount})</h2>
      {nextBefore !== null ? (
        <div className="comment-older">
          <Button variant="subtle" size="small" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder
              ? "불러오는 중…"
              : olderError !== null
                ? "다시 시도"
                : unloadedThreads > 0
                  ? `이전 코멘트 ${unloadedThreads}개 더 보기`
                  : "이전 코멘트 더 보기"}
          </Button>
          {olderError !== null ? (
            <span className="comment-load-error">이전 코멘트를 불러오지 못했습니다: {olderError}</span>
          ) : null}
        </div>
      ) : null}
      {topLevel.map((comment) => renderComment(comment, repliesOf(comment.id)))}
      {topLevel.length === 0 && nextBefore === null ? (
        <p className="comment-empty">
          <MessageSquare size={16} aria-hidden />
          {readOnly ? "코멘트가 없습니다" : "아직 코멘트가 없습니다 — 가장 먼저 의견을 남겨보세요"}
        </p>
      ) : null}
      {readOnly ? null : (
      <form
        className={`comment-composer${composerExpanded ? " comment-composer--active" : ""}`}
        onSubmit={handleSubmit}
      >
        <Avatar name={me?.name ?? "나"} size="small" />
        <div className="comment-composer-main">
          <TextArea
            ref={composerRef}
            label="코멘트 작성"
            rows={composerExpanded ? 3 : 1}
            placeholder="코멘트를 남겨보세요"
            value={draft}
            onFocus={() => setComposerActive(true)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={submitOnCtrlEnter}
          />
          {composerExpanded ? (
            <div className="comment-actions">
              <Button type="submit" size="small">
                코멘트 남기기
              </Button>
              <Button
                size="small"
                variant="subtle"
                onClick={() => {
                  setDraft("");
                  setComposerActive(false);
                  composerRef.current?.blur();
                }}
              >
                취소
              </Button>
              <span className="comment-hint">Ctrl+Enter로 저장</span>
            </div>
          ) : null}
        </div>
      </form>
      )}
      {readOnly ? null : (
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="코멘트 삭제"
        description={
          pendingDelete && pendingDelete.replyCount > 0
            ? `답글 ${pendingDelete.replyCount}개도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`
            : "코멘트를 삭제합니다. 이 작업은 되돌릴 수 없습니다."
        }
        confirmLabel="삭제"
        cancelLabel="취소"
        danger
        loading={deleting}
        onConfirm={() => void handleDeleteConfirm()}
      />
      )}
    </section>
  );
}
