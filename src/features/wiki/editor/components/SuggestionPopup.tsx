export interface SuggestionPopupProps {
  items: Array<{ id: string; label: string; description?: string }>;
  highlight: number;
  left: number;
  top: number;
  onPick: (index: number) => void;
  /** listbox의 접근성 이름 — [[ 자동완성/슬래시 메뉴 등 호출부마다 다르다 */
  ariaLabel: string;
}

/** 에디터 위 절대 위치 후보 목록 — [[자동완성·슬래시 메뉴 공용. 옵션은 탭 순서 제외(role=option)
 * description이 있으면(슬래시 메뉴) 라벨 아래 작은 회색 줄로 렌더 — wikiLink 자동완성은 description이
 * 없으므로 조건 렌더로 기존 한 줄 렌더를 그대로 유지한다. */
export function SuggestionPopup({ items, highlight, left, top, onPick, ariaLabel }: SuggestionPopupProps) {
  return (
    <ul className="editor-suggestions" role="listbox" aria-label={ariaLabel} style={{ left, top }}>
      {items.map((item, i) => (
        <li key={item.id} role="option" aria-selected={i === highlight}>
          <button type="button" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); onPick(i); }}>
            <span className="editor-suggestion-label">{item.label}</span>
            {item.description && (
              // aria-hidden — 접근성 이름은 라벨만으로 계산되게 한다(예: getByRole("option", { name: "제목 1" })).
              // 설명은 시각적 보조 텍스트일 뿐 스크린리더 항목 이름에는 포함하지 않는다.
              <span className="editor-suggestion-description" aria-hidden="true">
                {item.description}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
