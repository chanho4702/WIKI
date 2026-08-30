import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { Avatar, Button, TextArea, useToast } from "@chanho/react";
import { Check, MessageSquare, RotateCcw, X } from "lucide-react";
import type { Comment, CommentAnchor, User } from "../store/types";
import { addComment, listComments, setCommentResolved } from "../store/wikiStore";
import { anchorFromSelection, applyHighlights, clearHighlights } from "../lib/inlineAnchors";
import { formatCommentTime } from "./CommentSection";

/**
 * 인라인 댓글(W23) — 컨플루언스식 본문 하이라이트 대화.
 *
 * 본문에는 **댓글이 달렸다는 것만** 보인다: 배경색 + 밑줄 + 끝의 말풍선. 대화 내용은 그 줄
 * 오른쪽에 뜨는 상자에서 읽고 이어간다. 이전에는 스레드 목록을 본문 아래에 통째로 펼쳐 놨는데,
 * 인용문이 본문과 떨어져 있어 "어느 문장 얘기인지"가 매번 사라졌다.
 *
 * 본문이 바뀌어 인용 구간을 못 찾으면 스레드를 지우지 않는다 — 하이라이트가 사라진 대신 아래
 * 목록에 "위치 없음"으로 남긴다. 대화가 편집 한 번에 사라지는 쪽이 훨씬 나쁘다.
 */

/** 상자를 띄울 대상. 새 댓글은 아직 id가 없어 앵커로만 잡힌다. */
type Target =
  | { kind: "thread"; threadId: string }
  | { kind: "compose"; anchor: CommentAnchor };

interface Placement {
  /** 스코프 상단 기준 구간의 위쪽 — 넓은 화면에서 상자를 이 높이에 맞춘다. */
  top: number;
  /** 구간의 아래쪽 — 좁은 화면에서는 줄 바로 밑에 상자를 편다. */
  below: number;
}

export function InlineCommentLayer({
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
  const [comments, setComments] = useState<Comment[]>([]);
  const [locatedIds, setLocatedIds] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<Target | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; anchor: CommentAnchor } | null>(null);
  const [draft, setDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  const reload = useCallback(async () => {
    try {
      setComments(await listComments(pageId));
    } catch {
      setComments([]); // 인라인 댓글을 못 읽는다고 본문을 막지 않는다
    }
  }, [pageId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const threads = comments.filter((c) => c.anchorType === "inline" && c.parentId === null);
  const repliesOf = (threadId: string) => comments.filter((c) => c.parentId === threadId);
  const openThreads = threads.filter((t) => !t.resolvedAt);
  const resolvedThreads = threads.filter((t) => t.resolvedAt);
  const orphans = openThreads.filter((t) => !locatedIds.has(t.id));

  // 해결되지 않은 스레드만 본문에 칠한다 — 끝난 대화까지 칠하면 본문이 읽히지 않는다.
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;
    const roots = comments.filter((c) => c.anchorType === "inline" && c.parentId === null);
    setLocatedIds(
      applyHighlights(
        container,
        roots
          .filter((t) => !t.resolvedAt && t.anchorQuote)
          .map((t) => ({
            id: t.id,
            quote: t.anchorQuote as string,
            occurrence: t.anchorOccurrence ?? 0,
            replyCount: comments.filter((c) => c.parentId === t.id).length,
          })),
      ),
    );
    return () => clearHighlights(container);
    // threads/replies는 comments에서 파생된다 — 의존은 원본 하나로 충분하다.
  }, [comments, body, bodyRef]);

  /**
   * 구간의 위치를 스코프(=본문을 감싼 `.inline-comment-scope`) 기준 오프셋으로 잰다.
   *
   * 상자의 containing block이 그 스코프인데 본문 div가 첫 자식이라 두 요소의 상단이 같다 —
   * 본문 rect를 기준으로 삼아도 어긋나지 않는다.
   */
  const measure = useCallback(
    (element: Element | null): Placement | null => {
      const container = bodyRef.current;
      if (!container || !element) return null;
      const base = container.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return { top: rect.top - base.top, below: rect.bottom - base.top };
    },
    [bodyRef],
  );

  const openThread = useCallback(
    (threadId: string, element: Element | null) => {
      setMenu(null);
      setDraft("");
      setPlacement(measure(element));
      setTarget({ kind: "thread", threadId });
      // 목록에서 열었을 때는 구간이 화면 밖일 수 있다 — 어느 문장인지 보여야 대화가 읽힌다.
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [measure],
  );

  // 하이라이트를 누르면 그 줄 옆에서 대화가 열린다.
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;
    const markOf = (e: Event) =>
      (e.target as HTMLElement | null)?.closest?.("mark[data-comment-id]") ?? null;
    const onClick = (e: MouseEvent) => {
      const mark = markOf(e);
      if (!mark) return;
      e.preventDefault();
      openThread((mark as HTMLElement).dataset.commentId as string, mark);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const mark = markOf(e);
      if (!mark) return;
      e.preventDefault();
      openThread((mark as HTMLElement).dataset.commentId as string, mark);
    };
    container.addEventListener("click", onClick);
    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("click", onClick);
      container.removeEventListener("keydown", onKeyDown);
    };
  }, [bodyRef, openThread]);

  /**
   * 본문을 고르고 우클릭하면 "댓글 달기"가 뜬다.
   *
   * 고른 구간이 없으면 브라우저 기본 메뉴를 그대로 둔다 — 댓글과 무관한 우클릭까지 뺏으면
   * 링크 복사 같은 일상 동작이 막힌다.
   */
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;
    const onContextMenu = (e: MouseEvent) => {
      const anchor = anchorFromSelection(container);
      if (!anchor) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, anchor });
    };
    container.addEventListener("contextmenu", onContextMenu);
    return () => container.removeEventListener("contextmenu", onContextMenu);
  }, [bodyRef]);

  // 메뉴는 바깥을 누르거나 Esc면 닫힌다.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (target) draftRef.current?.focus();
  }, [target]);

  const startCompose = () => {
    if (!menu) return;
    // 아직 mark가 없으니 선택을 품은 요소로 높이를 맞춘다 — Range 자체는 rect를 못 주는
    // 환경이 있고(jsdom), 어차피 상자를 붙일 곳은 그 줄이지 글자 구간이 아니다.
    const selection = window.getSelection();
    const node = selection?.rangeCount ? selection.getRangeAt(0).commonAncestorContainer : null;
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    setPlacement(measure(element));
    setTarget({ kind: "compose", anchor: menu.anchor });
    setDraft("");
    setMenu(null);
  };

  const close = () => {
    setTarget(null);
    setDraft("");
  };

  const submit = async () => {
    if (!target || !draft.trim()) return;
    setBusy(true);
    try {
      if (target.kind === "compose") {
        await addComment(pageId, draft.trim(), null, target.anchor);
        setTarget(null);
      } else {
        await addComment(pageId, draft.trim(), target.threadId);
      }
      setDraft("");
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
      if (target?.kind === "thread" && target.threadId === thread.id) setTarget(null);
      await reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (comment: Comment) =>
    users.find((u) => u.id === comment.authorId)?.name ?? comment.authorName ?? "알 수 없음";

  const activeThread =
    target?.kind === "thread" ? (threads.find((t) => t.id === target.threadId) ?? null) : null;
  // 열어 둔 스레드가 해결으로 사라지면 상자도 같이 닫는다.
  const boxOpen = target?.kind === "compose" || activeThread !== null;

  const renderMessage = (comment: Comment, nested: boolean) => (
    <li key={comment.id} className={nested ? "inline-comment-message--reply" : undefined}>
      <div className="inline-comment-message-head">
        <Avatar name={nameOf(comment)} color="auto" size="small" />
        <strong>{nameOf(comment)}</strong>
        <span>{formatCommentTime(comment.createdAt)}</span>
      </div>
      <p className="inline-comment-body">{comment.body}</p>
    </li>
  );

  return (
    <>
      {menu ? (
        <div
          className="inline-comment-menu"
          role="menu"
          style={{ top: menu.y, left: menu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onMouseDown={startCompose}>
            <MessageSquare size={14} aria-hidden="true" />
            댓글 달기
          </button>
        </div>
      ) : null}

      {boxOpen ? (
        <aside
          className="inline-comment-box"
          aria-label={target?.kind === "compose" ? "본문 댓글 작성" : "본문 댓글"}
          style={
            {
              "--inline-comment-top": `${placement?.top ?? 0}px`,
              "--inline-comment-below": `${placement?.below ?? 0}px`,
            } as CSSProperties
          }
        >
          <div className="inline-comment-box-head">
            <blockquote className="inline-comment-quote">
              {target?.kind === "compose" ? target.anchor.quote : activeThread?.anchorQuote}
            </blockquote>
            <Button size="small" variant="subtle" iconOnly onClick={close} aria-label="닫기">
              <X size={14} aria-hidden="true" />
            </Button>
          </div>

          {activeThread ? (
            <ul className="inline-comment-messages">
              {renderMessage(activeThread, false)}
              {repliesOf(activeThread.id).map((reply) => renderMessage(reply, true))}
            </ul>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <TextArea
              ref={draftRef}
              label={target?.kind === "compose" ? "선택한 구간에 댓글" : "답글"}
              value={draft}
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="inline-comment-box-actions">
              <Button type="submit" size="small" disabled={busy || !draft.trim()}>
                {target?.kind === "compose" ? "댓글 달기" : "답글 남기기"}
              </Button>
              {activeThread ? (
                <Button
                  type="button"
                  size="small"
                  variant="subtle"
                  disabled={busy}
                  iconBefore={<Check size={14} aria-hidden="true" />}
                  onClick={() => void toggleResolved(activeThread)}
                >
                  해결
                </Button>
              ) : null}
            </div>
          </form>
        </aside>
      ) : null}

      {/*
        본문에서 사라진 대화만 목록으로 남긴다 — 하이라이트가 유일한 진입점인데, 위치를 못 찾거나
        해결된 스레드는 하이라이트가 없어 영영 닿을 수 없게 된다.
      */}
      {orphans.length > 0 || resolvedThreads.length > 0 ? (
        <section className="inline-comment-strays" aria-label="본문에 표시되지 않는 댓글">
          {orphans.length > 0 ? (
            <ul className="inline-comment-stray-list">
              {orphans.map((thread) => (
                <li key={thread.id}>
                  <span className="inline-comment-orphan">
                    본문이 바뀌어 이 구간을 찾을 수 없습니다
                  </span>
                  <blockquote className="inline-comment-quote">{thread.anchorQuote}</blockquote>
                  <p className="inline-comment-body">{thread.body}</p>
                  <Button
                    size="small"
                    variant="subtle"
                    disabled={busy}
                    iconBefore={<Check size={14} aria-hidden="true" />}
                    onClick={() => void toggleResolved(thread)}
                  >
                    해결
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          {resolvedThreads.length > 0 ? (
            <>
              <Button size="small" variant="subtle" onClick={() => setShowResolved((v) => !v)}>
                해결된 대화 {resolvedThreads.length}개 {showResolved ? "숨기기" : "보기"}
              </Button>
              {showResolved ? (
                <ul className="inline-comment-stray-list">
                  {resolvedThreads.map((thread) => (
                    <li key={thread.id} className="inline-comment-resolved">
                      <blockquote className="inline-comment-quote">{thread.anchorQuote}</blockquote>
                      <p className="inline-comment-body">{thread.body}</p>
                      <Button
                        size="small"
                        variant="subtle"
                        disabled={busy}
                        iconBefore={<RotateCcw size={14} aria-hidden="true" />}
                        onClick={() => void toggleResolved(thread)}
                      >
                        다시 열기
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
