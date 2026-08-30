import { useEffect, useState } from "react";
import type { ReactionSummary } from "../store/types";
import { listPageReactions, setPageReaction } from "../store/wikiStore";
import { ReactionBar } from "./ReactionBar";

/** 문서 리액션(W23) — 집계를 읽어 ReactionBar에 넘긴다. 못 읽으면 빈 줄로 둔다(본문을 막지 않는다). */
export function PageReactions({ pageId }: { pageId: string }) {
  const [reactions, setReactions] = useState<ReactionSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listPageReactions(pageId)
      .then((found) => {
        if (!cancelled) setReactions(found);
      })
      .catch(() => {
        if (!cancelled) setReactions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  if (reactions === null) return null;
  return (
    <ReactionBar
      label="문서 리액션"
      reactions={reactions}
      onToggle={(emoji, on) => setPageReaction(pageId, emoji, on)}
    />
  );
}
