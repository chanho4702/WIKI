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
      {items.map((item, i) => {
        const descriptionId = item.description ? `suggestion-desc-${item.id}` : undefined;
        return (
          // li[role=option] 자체도 subtree 텍스트(라벨+설명)로 이름이 계산되므로, 여기도
          // aria-label을 걸어 li와 안쪽 button 양쪽의 접근 가능한 이름을 라벨만으로 고정한다.
          <li key={item.id} role="option" aria-label={item.label} aria-selected={i === highlight}>
            <button
              type="button"
              tabIndex={-1}
              aria-label={item.label}
              aria-describedby={descriptionId}
              onMouseDown={(e) => { e.preventDefault(); onPick(i); }}
            >
              <span className="editor-suggestion-label">{item.label}</span>
              {item.description && (
                <span id={descriptionId} className="editor-suggestion-description">
                  {item.description}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
