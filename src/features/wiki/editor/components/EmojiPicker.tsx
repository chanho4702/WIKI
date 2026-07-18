import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { EMOJI_CATEGORIES, searchEmojis } from "../lib/emojiData";
import { useDismissablePopover } from "../../lib/useDismissablePopover";

export interface EmojiPickerProps {
  editor: Editor;
  /**
   * 열림 상태를 외부에서 제어하고 싶을 때(예: 슬래시 메뉴 "이모지" 항목, InsertMenu의 "이모지" 항목이
   * 이 팝오버를 열기 위함) 지정한다. 미지정 시 SpaceCreateModal.tsx와 동일한 패턴으로 내부 상태로
   * 관리한다 — 두 경우 모두 이 컴포넌트 자체는 독립적으로(자체 트리거 버튼 포함) 동작한다.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** 이모지 그리드의 열 수 — app.css의 `.emoji-picker-grid { grid-template-columns: repeat(6, 1fr); }`와
 * 반드시 일치해야 한다(↑↓ 행 이동 계산 기준). CSS를 바꾸면 이 상수도 함께 바꿀 것. */
const EMOJI_GRID_COLUMNS = 6;

/**
 * 이모지 피커 팝오버 (W6 T4, W7 T1에서 ARIA·키보드 내비 보강) — TopToolbar의 "이모지" 버튼이
 * 자체 트리거로 갖는다. 슬래시 메뉴/InsertMenu의 "이모지" 항목은 run이 UI를 열 수 없으므로
 * (SlashItem.run은 editor만 받음), action: "openEmoji" 마커를 두고 호출부(slashMenu.ts의 Suggestion
 * command, InsertMenu.select)가 이 컴포넌트의 open 상태를 controlled prop으로 true로 바꾸는 식으로
 * 우회한다 — 자세한 내용은 slashMenu.ts의 SlashItem.action, InsertMenu.tsx의 select() 주석 참고.
 *
 * 팝오버 관례는 InsertMenu.tsx(W6-T2 확정 패턴)를 그대로 따르되, 외부클릭/Escape/Tab-out 로직은
 * 공용 훅 useDismissablePopover.ts에 위임한다. 그리드/탭 버튼은 tabIndex={-1}로 탭 순서에서
 * 제외한다(검색 입력만 탭 가능) — 대신 그리드는 검색 입력에 포커스가 있는 채로 화살표 키(←→/↑↓)와
 * Enter로 내비게이션한다(W7 T1, EmojiPicker ARIA 정합 — W6 리뷰 Issue #1).
 */
export function EmojiPicker({ editor, open: openProp, onOpenChange: onOpenChangeProp }: EmojiPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState(EMOJI_CATEGORIES[0].id);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlight(0);
  }, [setOpen]);

  // 열릴 때마다 검색 입력에 포커스 — InsertMenu.tsx와 동일한 패턴
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 외부 클릭/Escape/Tab-out 닫기 — 공용 훅에 위임(InsertMenu.tsx W6-T2 확정 패턴: 외부 클릭·Tab-out은
  // 포커스를 건드리지 않고, Escape만 트리거로 재포커스한다).
  useDismissablePopover({ containerRef, triggerRef, open, onClose: close });

  const trimmed = query.trim();
  const activeCategory = EMOJI_CATEGORIES.find((c) => c.id === categoryId) ?? EMOJI_CATEGORIES[0];
  const visible = trimmed ? searchEmojis(trimmed) : activeCategory.emojis;

  // 검색어/카테고리가 바뀌면 하이라이트를 첫 항목으로 되돌린다 — 목록이 통째로 바뀌었는데 이전
  // 인덱스를 유지하면 화살표 키로 엉뚱한(또는 범위 밖) 항목이 선택되는 것처럼 보인다.
  useEffect(() => {
    setHighlight(0);
  }, [trimmed, categoryId]);

  const select = (char: string) => {
    editor.chain().focus().insertContent(char).run();
    close();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape는 여기서 처리하지 않는다 — useDismissablePopover가 컨테이너 전체 keydown으로
    // 승격해 처리한다(닫기 + 트리거 재포커스).
    if (!visible.length) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % visible.length);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + visible.length) % visible.length);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + EMOJI_GRID_COLUMNS) % visible.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (((h - EMOJI_GRID_COLUMNS) % visible.length) + visible.length) % visible.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const entry = visible[highlight];
      if (entry) select(entry.char);
    }
  };

  return (
    <div className="emoji-picker" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        aria-label="이모지"
        aria-expanded={open}
        className="emoji-picker-trigger"
        onClick={() => setOpen(!open)}
      >
        🙂
      </button>
      {open && (
        <div className="emoji-picker-popover">
          <input
            ref={inputRef}
            type="text"
            className="emoji-picker-filter"
            placeholder="이모지 검색"
            aria-label="이모지 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          {!trimmed && (
            // 탭바 형태지만 "선택 후 그 카테고리만 계속 보여주는 필터 토글"이라 지속적인 선택 상태를
            // aria-pressed로 드러내는 편이 tablist/tab(+연결된 tabpanel) 정합을 다 맞추는 것보다
            // 단순하고 정확하다(W7 T1 — W6 최종 리뷰 Issue #1, "과하면 단순화" 선택지 채택).
            <div className="emoji-picker-tabs" role="group" aria-label="이모지 카테고리">
              {EMOJI_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  tabIndex={-1}
                  aria-pressed={c.id === categoryId}
                  className={c.id === categoryId ? "is-active" : undefined}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <div className="emoji-picker-grid" role="listbox" aria-label="이모지 목록">
            {visible.map((e, i) => (
              // role=listbox의 자식은 role=option이어야 한다(W7 T1 — W6 최종 리뷰 Issue #1: 이전엔
              // role 없는 button이 바로 자식이었다). aria-selected는 옵션 역할에만 유효하므로 감싸는
              // div에 두고, 안쪽 button에는 두지 않는다(InsertMenu.tsx 관례와 동일).
              <div key={`${e.char}-${i}`} role="option" aria-selected={i === highlight} aria-label={e.keywords[0]}>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={e.keywords[0]}
                  className={i === highlight ? "emoji-picker-item is-highlighted" : "emoji-picker-item"}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => select(e.char)}
                >
                  {e.char}
                </button>
              </div>
            ))}
          </div>
          {visible.length === 0 && <p className="emoji-picker-empty">일치하는 이모지가 없습니다</p>}
        </div>
      )}
    </div>
  );
}
