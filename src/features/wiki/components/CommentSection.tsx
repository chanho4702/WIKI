import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Avatar, Button, Comment as CommentBlock, Spinner, TextArea, useToast } from "@chanho/react";
import type { Comment, User } from "../store/types";
import { addComment, listComments } from "../store/wikiStore";

export interface CommentSectionProps {
  pageId: string;
  /** 작성자 이름 표시용 — PageViewPage가 이미 로드한 목록 재사용 */
  users: User[];
}

/** 코멘트 시각 표기: ko-KR 날짜+시간 */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR");
}

/** 페이지 하단 코멘트 — 목록(오름차순) + 작성. alm-front IssueDetailModal 코멘트 탭 미러(Tabs 없이 직접 배치). */
export function CommentSection({ pageId, users }: CommentSectionProps) {
  // null = 로딩 중
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const toast = useToast();

  useEffect(() => {
    setComments(null);
    void listComments(pageId).then(setComments);
  }, [pageId]);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "알 수 없음";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await addComment(pageId, draft); // 빈 본문은 스토어가 throw
      setDraft("");
      setComments(await listComments(pageId)); // 작성 후 목록 재조회
      toast({ title: "코멘트를 남겼습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "코멘트 작성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  if (comments === null) {
    return <Spinner size="small" label="코멘트 로딩 중" />;
  }

  return (
    <section className="comment-section" aria-label="코멘트">
      <h2 className="comment-section-title">코멘트 ({comments.length})</h2>
      {comments.map((comment) => (
        <CommentBlock
          key={comment.id}
          author={userName(comment.authorId)}
          avatar={<Avatar name={userName(comment.authorId)} size="small" />}
          time={formatDateTime(comment.createdAt)}
        >
          <span data-testid="comment-body">{comment.body}</span>
        </CommentBlock>
      ))}
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
