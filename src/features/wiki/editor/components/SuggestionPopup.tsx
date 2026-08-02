import { useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

/** 캐럿 위치 — 팝업을 아래에 둘지 위로 뒤집을지 판단하려면 위/아래 경계가 둘 다 필요하다. */
export interface SuggestionAnchor {
  top: number;
  bottom: number;
  left: number;
}

export interface SuggestionPopupProps {
  items: Array<{ id: string; label: string; description?: string; icon?: LucideIcon }>;
  highlight: number;
  anchor: SuggestionAnchor;
  onPick: (index: number) => void;
  /** listbox의 접근성 이름 — [[ 자동완성/슬래시 메뉴 등 호출부마다 다르다 */
  ariaLabel: string;
}

/** 캐럿과 팝업 사이 간격. */
const GAP = 4;
/** 뷰포트 가장자리에 붙지 않게 남기는 여백. */
const MARGIN = 8;

/** 에디터 위 절대 위치 후보 목록 — [[자동완성·슬래시 메뉴 공용. 옵션은 탭 순서 제외(role=option)
 * description이 있으면(슬래시 메뉴) 라벨 아래 작은 회색 줄로 렌더 — wikiLink 자동완성은 description이
 * 없으므로 조건 렌더로 기존 한 줄 렌더를 그대로 유지한다. */
export function SuggestionPopup({ items, highlight, anchor, onPick, ariaLabel }: SuggestionPopupProps) {
  const ref = useRef<HTMLUListElement>(null);
  // 첫 렌더는 캐럿 아래(기존 동작). 측정 후 필요하면 페인트 전에 뒤집는다.
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + GAP });

  /**
   * 뷰포트 충돌 보정. 이게 없으면 문서 하단에서 `/`를 쳤을 때 목록이 화면 아래로 넘어가
   * 가려진다 — position:fixed라 스크롤로도 따라잡을 수 없어서 항목을 아예 고를 수 없었다.
   *
   * 아래에 자리가 없으면 캐럿 위로 뒤집고, 위도 모자라면(짧은 창) 뷰포트 안으로 밀어넣는다.
   * 가로도 같은 이유로 오른쪽 경계에서 잘리지 않게 clamp한다.
   *
   * useLayoutEffect인 이유: 페인트 전에 위치를 확정해야 한 프레임 깜빡이지 않는다.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    let top = anchor.bottom + GAP;
    if (top + height > vh - MARGIN) {
      const above = anchor.top - GAP - height;
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - MARGIN - height);
    }
    const left = Math.max(MARGIN, Math.min(anchor.left, vw - MARGIN - width));

    setPos((prev) => (prev.top === top && prev.left === left ? prev : { top, left }));
  }, [anchor.top, anchor.bottom, anchor.left, items.length]);

  return (
    <ul
      ref={ref}
      className="editor-suggestions"
      role="listbox"
      aria-label={ariaLabel}
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, i) => {
        const descriptionId = item.description ? `suggestion-desc-${item.id}` : undefined;
        const Icon = item.icon;
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
              {/* 슬래시 메뉴 항목만 icon을 갖는다(wikiLink 자동완성은 없음) — aria-hidden으로
                  접근 가능한 이름 계산에서 제외한다. .editor-suggestion-icon 스타일은 app.css에 있다. */}
              {Icon && <Icon size={16} aria-hidden className="editor-suggestion-icon" />}
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
