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
import { addComment, deleteComment, getCurrentUser, listComments, setCommentReaction, updateComment } from "../store/wikiStore";
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

/** 페이지 하단 코멘트 — 최상위 목록 + 답글 1단 + 본인 수정/삭제. */
export function CommentSection({ pageId, users }: CommentSectionProps) {
  const readOnly = useReadOnly();
  // null = 로딩 중
  const [comments, setComments] = useState<Comment[] | null>(null);
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
    setComments(null);
    setDraft("");
    setComposerActive(false);
    setReplyTo(null);
    setEditingId(null);
    setPendingDelete(null);
    void listComments(pageId).then(setComments);
  }, [pageId]);

  const reload = async () => setComments(await listComments(pageId));
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
      await addComment(pageId, replyDraft, replyTo);
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
      await updateComment(editingId, editDraft);
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
      await deleteComment(pendingDelete.comment.id);
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

  if (comments === null) {
    return <CommentSkeleton label="코멘트 로딩 중" />;
  }

  // 인라인 스레드(W21-4)는 본문 옆 InlineCommentLayer가 맡는다 — 페이지 댓글 목록에 섞지 않는다.
  const topLevel = comments.filter((c) => c.parentId === null && c.anchorType !== "inline");
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

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
                  onToggle={(emoji, on) => setCommentReaction(comment.id, emoji, on)}
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
      <h2 className="comment-section-title">코멘트 ({comments.length})</h2>
      {topLevel.map((comment) => renderComment(comment, repliesOf(comment.id)))}
      {comments.length === 0 ? (
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
