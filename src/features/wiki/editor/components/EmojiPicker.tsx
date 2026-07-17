import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { EMOJI_CATEGORIES, searchEmojis } from "../lib/emojiData";

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

/**
 * 이모지 피커 팝오버 (W6 T4) — TopToolbar의 "이모지" 버튼이 자체 트리거로 갖는다.
 * 슬래시 메뉴/InsertMenu의 "이모지" 항목은 run이 UI를 열 수 없으므로(SlashItem.run은 editor만 받음),
 * action: "openEmoji" 마커를 두고 호출부(slashMenu.ts의 Suggestion command, InsertMenu.select)가
 * 이 컴포넌트의 open 상태를 controlled prop으로 true로 바꾸는 식으로 우회한다 — 자세한 내용은
 * slashMenu.ts의 SlashItem.action, InsertMenu.tsx의 select() 주석 참고.
 *
 * 팝오버 관례는 InsertMenu.tsx(W6-T2 확정 패턴)를 그대로 따른다: 외부 클릭은 닫기만 하고 포커스를
 * 건드리지 않으며, Escape만 트리거 버튼으로 포커스를 되돌린다. 그리드/탭 버튼은 tabIndex={-1}로
 * 탭 순서에서 제외한다(검색 입력만 탭 가능).
 */
export function EmojiPicker({ editor, open: openProp, onOpenChange: onOpenChangeProp }: EmojiPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState(EMOJI_CATEGORIES[0].id);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, [setOpen]);

  // 열릴 때마다 검색 입력에 포커스 — InsertMenu.tsx와 동일한 패턴
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 외부 클릭 닫기 — InsertMenu.tsx 패턴: preventDefault 없이 닫기만 한다(포커스는 건드리지 않음)
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, close]);

  const trimmed = query.trim();
  const activeCategory = EMOJI_CATEGORIES.find((c) => c.id === categoryId) ?? EMOJI_CATEGORIES[0];
  const visible = trimmed ? searchEmojis(trimmed) : activeCategory.emojis;

  const select = (char: string) => {
    editor.chain().focus().insertContent(char).run();
    close();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
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
            <div className="emoji-picker-tabs" role="tablist" aria-label="이모지 카테고리">
              {EMOJI_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  tabIndex={-1}
                  role="tab"
                  aria-selected={c.id === categoryId}
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
              <button
                key={`${e.char}-${i}`}
                type="button"
                tabIndex={-1}
                aria-label={e.keywords[0]}
                className="emoji-picker-item"
                onClick={() => select(e.char)}
              >
                {e.char}
              </button>
            ))}
          </div>
          {visible.length === 0 && <p className="emoji-picker-empty">일치하는 이모지가 없습니다</p>}
        </div>
      )}
    </div>
  );
}
