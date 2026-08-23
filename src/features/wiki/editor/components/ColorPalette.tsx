import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { ChevronDown } from "lucide-react";
import { BG_COLORS, TEXT_COLORS, type BgColorName, type TextColorName } from "../extensions/textColors";
import { useDismissablePopover } from "../../lib/useDismissablePopover";

/** 팔레트 색 이름의 한국어 표기 — 접근 이름("빨강 글자색")에 쓴다. */
export const COLOR_LABELS: Record<string, string> = {
  gray: "회색", red: "빨강", orange: "주황", green: "초록",
  blue: "파랑", purple: "보라", yellow: "노랑",
};

/** 최근 사용 색 — TopToolbar "A" 버튼이 원클릭으로 다시 적용한다(컨플식). 세션·탭 간 유지. */
const LAST_TEXT_KEY = "wiki.ui.lastTextColor";
const LAST_BG_KEY = "wiki.ui.lastBgColor";

export function getLastTextColor(): TextColorName {
  const v = localStorage.getItem(LAST_TEXT_KEY);
  return (TEXT_COLORS as readonly string[]).includes(v ?? "") ? (v as TextColorName) : "red";
}
export function setLastTextColor(color: TextColorName): void {
  try {
    localStorage.setItem(LAST_TEXT_KEY, color);
  } catch {
    /* 저장 실패는 무시 — 기본값으로 동작 */
  }
}
export function getLastBgColor(): BgColorName {
  const v = localStorage.getItem(LAST_BG_KEY);
  return (BG_COLORS as readonly string[]).includes(v ?? "") ? (v as BgColorName) : "yellow";
}
export function setLastBgColor(color: BgColorName): void {
  try {
    localStorage.setItem(LAST_BG_KEY, color);
  } catch {
    /* 저장 실패는 무시 */
  }
}

/** 색 스와치 그리드 한 섹션 — 컨플루언스 색상 피커 참조(사각 칩 그리드 + 현재 색 ✓ + "기본" 칩). */
export function ColorSwatchGrid({
  label,
  colors,
  varPrefix,
  activeColor,
  clearLabel,
  onPick,
}: {
  /** 섹션 제목 겸 role=group 접근 이름("글자색" 등) */
  label: string;
  colors: readonly string[];
  /** 칩 배경 CSS 변수 접두 — "txt" | "bg" (--wiki-<prefix>-<색>) */
  varPrefix: "txt" | "bg";
  activeColor: string | null;
  /** "기본" 칩의 접근 이름("글자색 제거" 등 — 기존 테스트 계약 유지) */
  clearLabel: string;
  onPick: (color: string | null) => void;
}) {
  return (
    <div className="color-palette-section" role="group" aria-label={label}>
      <span className="color-palette-title">{label}</span>
      <div className="color-palette-grid">
        <button
          type="button"
          className="color-swatch color-swatch-none"
          aria-label={clearLabel}
          title={clearLabel}
          aria-pressed={activeColor === null}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(null);
          }}
        />
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            className="color-swatch"
            style={{ background: `var(--wiki-${varPrefix}-${color})` }}
            aria-label={`${COLOR_LABELS[color]} ${label}`}
            title={COLOR_LABELS[color]}
            aria-pressed={activeColor === color}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(color);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 글자색·배경색 팔레트 팝오버 — TopToolbar "A" 드롭다운과 버블 툴바가 공유한다.
 * 스와치를 고르면 즉시 적용하고 최근 색을 갱신한다. 같은 색을 다시 고르면 해제(토글).
 */
export function TextColorPalette({ editor, onDone }: { editor: Editor; onDone?: () => void }) {
  const activeText = TEXT_COLORS.find((c) => editor.isActive("textColor", { color: c })) ?? null;
  const activeBg = BG_COLORS.find((c) => editor.isActive("bgColor", { color: c })) ?? null;
  return (
    <div className="color-palette" role="group" aria-label="색상 선택">
      <ColorSwatchGrid
        label="글자색"
        colors={TEXT_COLORS}
        varPrefix="txt"
        activeColor={activeText}
        clearLabel="글자색 제거"
        onPick={(color) => {
          if (color === null || activeText === color) {
            editor.chain().focus().unsetTextColor().run();
          } else {
            editor.chain().focus().setTextColor(color as TextColorName).run();
            setLastTextColor(color as TextColorName);
          }
          onDone?.();
        }}
      />
      <ColorSwatchGrid
        label="배경색"
        colors={BG_COLORS}
        varPrefix="bg"
        activeColor={activeBg}
        clearLabel="배경색 제거"
        onPick={(color) => {
          if (color === null || activeBg === color) {
            editor.chain().focus().unsetBgColor().run();
          } else {
            editor.chain().focus().setBgColor(color as BgColorName).run();
            setLastBgColor(color as BgColorName);
          }
          onDone?.();
        }}
      />
    </div>
  );
}

/**
 * TopToolbar 글자 색상 스플릿 컨트롤(컨플식) — "가" 버튼은 최근 색을 원클릭 재적용(이미 그
 * 색이면 해제), 화살표가 팔레트를 연다. 최근 색은 밑줄 바로 보여준다.
 */
export function TextColorControl({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissablePopover({ containerRef, triggerRef, open, onClose: close });

  const last = getLastTextColor();
  return (
    <div className="color-split" ref={containerRef}>
      <button
        type="button"
        aria-label="글자 색상 적용"
        title={`글자 색상 (${COLOR_LABELS[last]})`}
        aria-pressed={editor.isActive("textColor")}
        className={editor.isActive("textColor") ? "is-active" : undefined}
        onMouseDown={(e) => {
          e.preventDefault();
          if (editor.isActive("textColor", { color: last })) {
            editor.chain().focus().unsetTextColor().run();
          } else {
            editor.chain().focus().setTextColor(last).run();
          }
        }}
      >
        <span className="color-a-glyph">
          가
          <span className="color-a-bar" style={{ background: `var(--wiki-txt-${last})` }} aria-hidden="true" />
        </span>
      </button>
      <button
        ref={triggerRef}
        type="button"
        className="color-split-caret"
        aria-label="색상 선택"
        title="색상 선택"
        aria-expanded={open}
        aria-haspopup="true"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        <ChevronDown size={12} aria-hidden />
      </button>
      {open ? <TextColorPalette editor={editor} onDone={close} /> : null}
    </div>
  );
}
