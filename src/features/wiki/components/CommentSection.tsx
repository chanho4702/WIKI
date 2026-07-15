import { Fragment, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Avatar, Button, Comment as CommentBlock, Spinner, TextArea, useToast } from "@chanho/react";
import type { CommentAction } from "@chanho/react";
import type { Comment, User } from "../store/types";
import { addComment, deleteComment, getCurrentUser, listComments, updateComment } from "../store/wikiStore";

export interface CommentSectionProps {
  pageId: string;
  /** 작성자 이름 표시용 — PageViewPage가 이미 로드한 목록 재사용 */
  users: User[];
}

/** 코멘트 시각 표기: ko-KR 날짜+시간 */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR");
}

/** 페이지 하단 코멘트 — 최상위 목록 + 답글 1단 + 본인 수정/삭제. */
export function CommentSection({ pageId, users }: CommentSectionProps) {
  // null = 로딩 중
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const toast = useToast();

  useEffect(() => {
    void getCurrentUser().then((me) => setMeId(me.id));
  }, []);

  useEffect(() => {
    setComments(null);
    setDraft("");
    setReplyTo(null);
    setEditingId(null);
    void listComments(pageId).then(setComments);
  }, [pageId]);

  const reload = async () => setComments(await listComments(pageId));
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "알 수 없음";
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

  const handleDelete = async (comment: Comment, replyCount: number) => {
    const message =
      replyCount > 0
        ? `답글 ${replyCount}개도 함께 삭제됩니다. 코멘트를 삭제할까요?`
        : "코멘트를 삭제할까요?";
    if (!window.confirm(message)) return;
    try {
      await deleteComment(comment.id);
      await reload();
      toast({ title: "코멘트를 삭제했습니다", appearance: "success" });
    } catch (error) {
      fail("코멘트 삭제 실패", error);
    }
  };

  if (comments === null) {
    return <Spinner size="small" label="코멘트 로딩 중" />;
  }

  const topLevel = comments.filter((c) => c.parentId === null);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  /**
   * DS Comment의 actions prop으로 하단 액션을 구성한다.
   * replies가 null이면 답글(들여쓰기 항목) — 답글 액션을 넣지 않는다.
   * 수정/삭제는 본인 코멘트에만, 삭제는 danger로 강조된다.
   */
  const actionsFor = (comment: Comment, replies: Comment[] | null): CommentAction[] => {
    const actions: CommentAction[] = [];
    if (replies !== null) {
      actions.push({
        label: "답글",
        onClick: () => {
          setReplyTo(comment.id);
          setReplyDraft("");
        },
      });
    }
    if (comment.authorId === meId) {
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
        onClick: () => void handleDelete(comment, replies?.length ?? 0),
      });
    }
    return actions;
  };

  /** replies가 null이면 답글 — nested 들여쓰기로 렌더하고 하위 목록/답글 폼을 붙이지 않는다 */
  const renderComment = (comment: Comment, replies: Comment[] | null) => {
    const editing = editingId === comment.id;
    return (
      <Fragment key={comment.id}>
        <CommentBlock
          author={userName(comment.authorId)}
          avatar={<Avatar name={userName(comment.authorId)} size="small" />}
          time={formatDateTime(comment.createdAt) + (comment.updatedAt ? " (수정됨)" : "")}
          nested={replies === null}
          actions={editing ? undefined : actionsFor(comment, replies)}
        >
          {editing ? (
            <div className="comment-edit">
              <TextArea
                label="코멘트 수정"
                rows={2}
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
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
            <span data-testid="comment-body">{comment.body}</span>
          )}
        </CommentBlock>
        {replies !== null && replies.length > 0 ? (
          <div data-testid="comment-replies">
            {replies.map((reply) => renderComment(reply, null))}
          </div>
        ) : null}
        {replies !== null && replyTo === comment.id ? (
          <form className="comment-form" onSubmit={handleReplySubmit}>
            <TextArea
              label="답글 작성"
              rows={2}
              placeholder="답글을 입력하세요"
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
            />
            <div className="comment-actions">
              <Button type="submit" size="small">
                답글 남기기
              </Button>
              <Button size="small" variant="subtle" onClick={() => setReplyTo(null)}>
                취소
              </Button>
            </div>
          </form>
        ) : null}
      </Fragment>
    );
  };

  return (
    <section className="comment-section" aria-label="코멘트">
      <h2 className="comment-section-title">코멘트 ({comments.length})</h2>
      {topLevel.map((comment) => renderComment(comment, repliesOf(comment.id)))}
      {comments.length === 0 ? <p className="comment-empty">아직 코멘트가 없습니다</p> : null}
      <form className="comment-form" onSubmit={handleSubmit}>
        <TextArea
          label="코멘트 작성"
          rows={3}
          placeholder="코멘트를 입력하세요"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" size="small">
          코멘트 남기기
        </Button>
      </form>
    </section>
  );
}
