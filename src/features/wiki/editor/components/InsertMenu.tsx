import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { filterSlashItems, type SlashItem } from "../extensions/slashMenu";

/**
 * 요소 브라우저(컨플루언스 "삽입" 메뉴 스타일) — TopToolbar 끝의 + 버튼을 누르면 SLASH_ITEMS를
 * 라벨+설명 2줄로 나열하는 팝오버가 뜬다. 슬래시 메뉴(에디터 안에서 "/"로 여는 것)와 동일한
 * 항목 데이터를 재사용하되, 진입점은 마우스만으로도 쓸 수 있는 버튼이라는 점이 다르다.
 *
 * 포커스 정책 — WikiLayout.tsx의 사이드바 토글 패턴(트리거 ref + 닫힘 시 재포커스)을 참고해,
 * Escape/외부 클릭으로 닫힐 때는 트리거(+) 버튼으로 포커스를 되돌리고(키보드 사용자가 위치를
 * 잃지 않도록), 항목을 선택해 닫힐 때는 대신 에디터로 포커스를 보낸다(바로 이어서 타이핑하도록).
 */
export function InsertMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = filterSlashItems(query);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlight(0);
  }, []);

  // 열릴 때마다 필터 입력에 포커스 — 브리프 지시(placeholder "요소 검색", 열릴 때 포커스)
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 외부 클릭 닫기 — 트리거 버튼도 컨테이너 안에 있으므로, 버튼 자체를 누른 mousedown은 여기서
  // "안"으로 판정돼 무시되고 onClick 토글로만 처리된다.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // mousedown 기본 동작(포커스 이동/블러)을 막아야, 바로 아래서 트리거로 되돌리는 focus()가
        // 브라우저의 기본 블러 처리로 덮어써지지 않는다 — 클릭 대상이 포커스 불가 영역이어도 마찬가지다.
        e.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, close]);

  const select = (item: SlashItem) => {
    close();
    // 슬래시 메뉴의 command 핸들러와 동일하게, item.run 전에 에디터 포커스를 보장한다 —
    // 이미지처럼 prompt를 취소할 수 있는 run은 그 경우 focus를 안 걸 수 있기 때문이다.
    editor.chain().focus().run();
    item.run(editor);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
      return;
    }
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
            {items.map((item, i) => (
              <li key={item.id} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  className={i === highlight ? "is-highlighted" : undefined}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => select(item)}
                >
                  <span className="insert-menu-item-label">{item.label}</span>
                  {/* aria-hidden — SuggestionPopup과 동일한 정책: 접근성 이름은 라벨만으로 계산되게 한다 */}
                  <span className="insert-menu-item-description" aria-hidden="true">
                    {item.description}
                  </span>
                </button>
              </li>
            ))}
            {items.length === 0 && <li className="insert-menu-empty">일치하는 요소가 없습니다</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
