import { useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { REACTION_EMOJIS, type ReactionSummary } from "../store/types";

/**
 * 리액션 줄(W23) — 문서 아래와 댓글마다 붙는다.
 *
 * "잘 봤다"를 표현할 방법이 댓글뿐이었다. 한마디 남기자고 댓글을 쓰면 스레드가 잡음으로 차고,
 * 그래서 아무도 안 남긴다 — 문서가 읽히는지 작성자가 알 길이 없었다.
 *
 * 누르면 **먼저 그린 뒤** 서버에 보낸다(낙관적). 응답의 집계가 오면 그것으로 덮는다 — 다른 사람이
 * 그사이 누른 수까지 그때 맞춰진다. 실패하면 이전 값으로 되돌린다.
 */
export function ReactionBar({
  reactions,
  onToggle,
  label,
}: {
  reactions: ReactionSummary[];
  /** 바뀐 뒤의 집계를 돌려준다. 던지면 이전 값으로 되돌린다. */
  onToggle: (emoji: string, on: boolean) => Promise<ReactionSummary[]>;
  /** 접근성 이름 — 한 화면에 여러 줄이 있어 구분이 필요하다("댓글 리액션" 등). */
  label: string;
}) {
  const [items, setItems] = useState(reactions);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // 부모가 새 목록을 주면(재조회) 그것이 정답이다.
  useEffect(() => {
    setItems(reactions);
  }, [reactions]);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const toggle = async (emoji: string) => {
    const before = items;
    const current = items.find((r) => r.emoji === emoji);
    const on = !(current?.reacted ?? false);
    // 낙관적 반영 — 고정 집합의 순서를 지킨다(수가 바뀔 때 칩이 자리를 옮기면 누르려던 것을 놓친다).
    const next = REACTION_EMOJIS.flatMap((e) => {
      const r = items.find((x) => x.emoji === e);
      if (e !== emoji) return r ? [r] : [];
      const count = (r?.count ?? 0) + (on ? 1 : -1);
      return count <= 0 ? [] : [{ emoji: e, count, reacted: on }];
    });
    setItems(next);
    setPickerOpen(false);
    try {
      setItems(await onToggle(emoji, on));
    } catch {
      setItems(before);
    }
  };

  return (
    <div className="reaction-bar" role="group" aria-label={label}>
      {items.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={r.reacted ? "reaction-chip is-mine" : "reaction-chip"}
          aria-pressed={r.reacted}
          aria-label={`${r.emoji} ${r.count}`}
          onClick={() => void toggle(r.emoji)}
        >
          <span aria-hidden="true">{r.emoji}</span>
          <span className="reaction-count">{r.count}</span>
        </button>
      ))}
      <div className="reaction-picker-anchor" ref={pickerRef}>
        <button
          type="button"
          className="reaction-add"
          aria-label="리액션 추가"
          aria-haspopup="true"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((v) => !v)}
        >
          <SmilePlus size={14} aria-hidden="true" />
        </button>
        {pickerOpen ? (
          <div className="reaction-picker" role="menu" aria-label="리액션 고르기">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                className="reaction-picker-item"
                aria-label={emoji}
                onClick={() => void toggle(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
