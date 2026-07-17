export interface SuggestionPopupProps {
  items: Array<{ id: string; label: string }>;
  highlight: number;
  left: number;
  top: number;
  onPick: (index: number) => void;
  /** listbox의 접근성 이름 — [[ 자동완성/슬래시 메뉴 등 호출부마다 다르다 */
  ariaLabel: string;
}

/** 에디터 위 절대 위치 후보 목록 — [[자동완성·슬래시 메뉴 공용. 옵션은 탭 순서 제외(role=option) */
export function SuggestionPopup({ items, highlight, left, top, onPick, ariaLabel }: SuggestionPopupProps) {
  return (
    <ul className="editor-suggestions" role="listbox" aria-label={ariaLabel} style={{ left, top }}>
      {items.map((item, i) => (
        <li key={item.id} role="option" aria-selected={i === highlight}>
          <button type="button" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); onPick(i); }}>
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
