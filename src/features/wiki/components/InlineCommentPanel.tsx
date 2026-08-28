import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Button, TextArea, useToast } from "@chanho/react";
import { Check, MessageSquareQuote, RotateCcw } from "lucide-react";
import type { Comment, CommentAnchor, User } from "../store/types";
import { addComment, listComments, setCommentResolved } from "../store/wikiStore";
import { anchorFromSelection, applyHighlights, clearHighlights } from "../lib/inlineAnchors";
import { formatCommentTime } from "./CommentSection";

/**
 * 인라인 댓글(W21-4) — 컨플루언스의 본문 하이라이트 댓글.
 *
 * 본문에서 텍스트를 고르면 "댓글" 버튼이 뜨고, 남긴 스레드는 그 구간을 하이라이트로 표시한다.
 * 해결하면 하이라이트가 내려가고 목록에서도 접힌다(스레드는 남는다 — 다시 열 수 있어야 한다).
 *
 * 본문이 바뀌어 인용 구간을 못 찾으면 스레드를 지우지 않고 "위치 없음"으로 남긴다.
 * 대화가 편집 한 번에 사라지는 쪽이 훨씬 나쁘다.
 */
export function InlineCommentPanel({
  pageId,
  body,
  users,
  bodyRef,
}: {
  pageId: string;
  /** 본문이 바뀌면 하이라이트를 다시 계산하기 위한 의존값. */
  body: string;
  users: User[];
  bodyRef: RefObject<HTMLElement | null>;
}) {
  const toast = useToast();
  const [threads, setThreads] = useState<Comment[]>([]);
  const [locatedIds, setLocatedIds] = useState<Set<string>>(new Set());
  const [pendingAnchor, setPendingAnchor] = useState<CommentAnchor | null>(null);
  const [draft, setDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const reload = useCallback(async () => {
    try {
      const all = await listComments(pageId);
      setThreads(all.filter((c) => c.anchorType === "inline" && c.parentId === null));
    } catch {
      setThreads([]); // 인라인 댓글을 못 읽는다고 본문을 막지 않는다
    }
  }, [pageId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 해결되지 않은 스레드만 본문에 표시한다 — 끝난 대화까지 칠하면 본문이 읽히지 않는다.
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;
    const open = threads.filter((t) => !t.resolvedAt && t.anchorQuote);
    setLocatedIds(
      applyHighlights(
        container,
        open.map((t) => ({
          id: t.id,
          quote: t.anchorQuote as string,
          occurrence: t.anchorOccurrence ?? 0,
        })),
      ),
    );
    return () => clearHighlights(container);
  }, [threads, body, bodyRef]);

  // 본문에서 텍스트를 고르면 앵커 후보로 잡는다. 선택이 풀리면 후보도 사라진다.
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;
    const onMouseUp = () => {
      const anchor = anchorFromSelection(container);
      if (anchor) setPendingAnchor(anchor);
    };
    container.addEventListener("mouseup", onMouseUp);
    return () => container.removeEventListener("mouseup", onMouseUp);
  }, [bodyRef]);

  useEffect(() => {
    if (pendingAnchor) composerRef.current?.focus();
  }, [pendingAnchor]);

  const submit = async () => {
    if (!pendingAnchor || !draft.trim()) return;
    setBusy(true);
    try {
      await addComment(pageId, draft.trim(), null, pendingAnchor);
      setDraft("");
      setPendingAnchor(null);
      await reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const toggleResolved = async (thread: Comment) => {
    setBusy(true);
    try {
      await setCommentResolved(thread.id, !thread.resolvedAt);
      await reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const open = threads.filter((t) => !t.resolvedAt);
  const resolved = threads.filter((t) => t.resolvedAt);
  const nothingToShow = threads.length === 0 && pendingAnchor === null;
  if (nothingToShow) return null;

  const nameOf = (comment: Comment) =>
    users.find((u) => u.id === comment.authorId)?.name ?? comment.authorName ?? "알 수 없음";

  return (
    <section className="inline-comments" aria-label="본문 댓글">
      <h2 className="inline-comments-title">
        <MessageSquareQuote size={16} aria-hidden="true" />본문 댓글 {open.length > 0 ? `(${open.length})` : ""}
      </h2>

      {pendingAnchor ? (
        <form
          className="inline-comment-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <blockquote className="inline-comment-quote">{pendingAnchor.quote}</blockquote>
          <TextArea
            ref={composerRef}
            label="선택한 구간에 댓글"
            value={draft}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="inline-comment-composer-actions">
            <Button type="submit" size="small" disabled={busy || !draft.trim()}>
              댓글 달기
            </Button>
            <Button
              type="button"
              size="small"
              variant="subtle"
              onClick={() => {
                setPendingAnchor(null);
                setDraft("");
              }}
            >
              취소
            </Button>
          </div>
        </form>
      ) : null}

      <ul className="inline-comments-list">
        {open.map((thread) => (
          <li key={thread.id}>
            <blockquote className="inline-comment-quote">{thread.anchorQuote}</blockquote>
            {!locatedIds.has(thread.id) ? (
              <span className="inline-comment-orphan">
                본문이 바뀌어 이 구간을 찾을 수 없습니다
              </span>
            ) : null}
            <p className="inline-comment-body">{thread.body}</p>
            <div className="inline-comment-meta">
              <span>{nameOf(thread)}</span>
              <span>{formatCommentTime(thread.createdAt)}</span>
              <Button
                size="small"
                variant="subtle"
                disabled={busy}
                onClick={() => void toggleResolved(thread)}
              >
                <Check size={14} aria-hidden="true" />
                해결
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {resolved.length > 0 ? (
        <div className="inline-comments-resolved">
          <Button size="small" variant="subtle" onClick={() => setShowResolved((v) => !v)}>
            해결된 대화 {resolved.length}개 {showResolved ? "숨기기" : "보기"}
          </Button>
          {showResolved ? (
            <ul className="inline-comments-list">
              {resolved.map((thread) => (
                <li key={thread.id} className="inline-comment-resolved">
                  <blockquote className="inline-comment-quote">{thread.anchorQuote}</blockquote>
                  <p className="inline-comment-body">{thread.body}</p>
                  <div className="inline-comment-meta">
                    <span>{nameOf(thread)}</span>
                    <Button
                      size="small"
                      variant="subtle"
                      disabled={busy}
                      onClick={() => void toggleResolved(thread)}
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      다시 열기
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
