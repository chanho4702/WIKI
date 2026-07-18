import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { filterInsertMenuItems, type SlashItem } from "../extensions/slashMenu";
import { useDismissablePopover } from "../../lib/useDismissablePopover";

/**
 * 요소 브라우저(컨플루언스 "삽입" 메뉴 스타일) — TopToolbar 끝의 + 버튼을 누르면 SLASH_ITEMS를
 * 라벨+설명 2줄로 나열하는 팝오버가 뜬다. 슬래시 메뉴(에디터 안에서 "/"로 여는 것)와 동일한
 * 항목 데이터를 재사용하되, 진입점은 마우스만으로도 쓸 수 있는 버튼이라는 점이 다르다.
 *
 * 포커스 정책 — WikiLayout.tsx의 사이드바 토글 패턴(트리거 ref + 닫힘 시 재포커스)을 참고하되,
 * "닫히는 이유"에 따라 되돌릴 곳이 다르다.
 * - Escape(키보드로 닫음): 트리거(+) 버튼으로 포커스를 되돌린다 — 키보드 사용자가 위치를 잃지 않도록.
 * - 외부 클릭으로 닫힘: 포커스를 강탈하지 않는다 — preventDefault 없이 그냥 닫기만 하면, 클릭
 *   대상(다른 툴바 버튼, 에디터 본문 등)이 자연스럽게 포커스/캐럿을 받는다. 여기서 트리거로
 *   강제로 되돌리면 "다른 버튼을 클릭했는데 포커스는 + 버튼에 있다"거나 "에디터 본문을 클릭했는데
 *   캐럿이 안 놓인다" 같은 회귀가 생긴다(리뷰 반영 — 이전엔 preventDefault + 강제 focus였다).
 * - 항목 선택으로 닫힘: 에디터로 포커스를 보낸다(바로 이어서 타이핑하도록).
 */
export interface InsertMenuProps {
  editor: Editor;
  /** action: "openEmoji" 항목(이모지) 선택 시 호출 — TopToolbar가 EmojiPicker의 open 상태를 연다.
   * slashMenu.ts의 Suggestion command와 동일한 분기를 여기서도 둔다(InsertMenu는 SLASH_ITEMS를
   * 그대로 재사용하므로 "이모지" 항목이 이 팝오버에도 그대로 노출되기 때문). */
  onOpenEmoji?: () => void;
}

export function InsertMenu({ editor, onOpenEmoji }: InsertMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 라벨뿐 아니라 설명도 검색한다(W7 T2) — 슬래시 메뉴는 filterSlashItems(라벨 전용)를 그대로 쓴다.
  const items = filterInsertMenuItems(query);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlight(0);
  }, []);

  // 열릴 때마다 필터 입력에 포커스 — 브리프 지시(placeholder "요소 검색", 열릴 때 포커스)
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 외부 클릭/Escape/Tab-out 닫기 — 공용 훅(useDismissablePopover.ts)에 위임한다. 트리거 버튼도
  // 컨테이너 안에 있으므로, 버튼 자체를 누른 mousedown은 "안"으로 판정돼 무시되고 onClick 토글로만
  // 처리된다. 외부 클릭은 preventDefault 없이 닫기만 한다 — 다른 툴바 버튼이나 에디터 본문
  // (contenteditable)을 클릭했을 때 그 대상이 정상적으로 포커스/캐럿을 받아야 하기 때문이다.
  useDismissablePopover({ containerRef, triggerRef, open, onClose: close });

  const select = (item: SlashItem) => {
    close();
    if (item.action === "openEmoji") {
      onOpenEmoji?.();
      return;
    }
    // 슬래시 메뉴의 command 핸들러와 동일하게, item.run 전에 에디터 포커스를 보장한다 —
    // 이미지처럼 prompt를 취소할 수 있는 run은 그 경우 focus를 안 걸 수 있기 때문이다.
    editor.chain().focus().run();
    item.run(editor);
  };

  // Escape는 더 이상 여기서 처리하지 않는다 — useDismissablePopover가 컨테이너 전체 keydown으로
  // 승격해 처리한다(닫기 + 트리거 재포커스).
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length) setHighlight((h) => (h + 1) % items.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length) setHighlight((h) => (h - 1 + items.length) % items.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = items[highlight];
      if (item) select(item);
    }
  };

  return (
    <div className="insert-menu" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        aria-label="요소 삽입"
        aria-expanded={open}
        className="insert-menu-trigger"
        onClick={() => (open ? close() : setOpen(true))}
      >
        +
      </button>
      {open && (
        <div className="insert-menu-popover">
          <input
            ref={inputRef}
            type="text"
            className="insert-menu-filter"
            placeholder="요소 검색"
            aria-label="요소 검색"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={handleInputKeyDown}
          />
          <ul className="insert-menu-list" role="listbox" aria-label="요소 삽입 메뉴">
            {items.map((item, i) => {
              const descriptionId = `insert-menu-desc-${item.id}`;
              return (
                // li[role=option]과 안쪽 button 둘 다 subtree 텍스트(라벨+설명)로 이름이
                // 계산되므로, 양쪽에 aria-label을 걸어 접근 가능한 이름을 라벨만으로 고정한다
                // (그렇지 않으면 description 텍스트까지 섞여 getByRole name 매치가 깨진다).
                // description은 button에 aria-describedby로 별도 연결해 스크린 리더가 읽어주게 한다.
                <li key={item.id} role="option" aria-label={item.label} aria-selected={i === highlight}>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={item.label}
                    aria-describedby={descriptionId}
                    className={i === highlight ? "is-highlighted" : undefined}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => select(item)}
                  >
                    <span className="insert-menu-item-label">{item.label}</span>
                    <span id={descriptionId} className="insert-menu-item-description">
                      {item.description}
                    </span>
                  </button>
                </li>
              );
            })}
            {items.length === 0 && <li className="insert-menu-empty">일치하는 요소가 없습니다</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
