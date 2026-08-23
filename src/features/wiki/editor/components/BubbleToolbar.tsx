import { useEffect, useState, type ReactNode } from "react";
import { posToDOMRect } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Bold, Italic, Strikethrough, Code, Link, Palette } from "lucide-react";
import { BG_COLORS, TEXT_COLORS } from "../extensions/textColors";
import { promptSetLink } from "../lib/linkCommand";

/** 팔레트 색 이름의 한국어 표기 — 접근 이름("빨강 글자색")에 쓴다. */
const COLOR_LABELS: Record<string, string> = {
  gray: "회색", red: "빨강", orange: "주황", green: "초록",
  blue: "파랑", purple: "보라", yellow: "노랑",
};

/** 버튼 행 — 위치 계산과 분리해 jsdom에서 단독 테스트 가능하게 한다(좌표 계산 없이 버튼 동작만 검증) */
export function ToolbarButtons({ editor }: { editor: Editor }) {
  // 색상 팔레트 팝오버 — 툴바 안 로컬 상태. 선택 영역이 풀리면(툴바가 사라지면) 함께 닫힌다.
  const [paletteOpen, setPaletteOpen] = useState(false);
  // TopToolbar와 동일하게 접근 가능한 이름은 aria-label로 고정하고 lucide 아이콘은 aria-hidden.
  const btn = (label: string, icon: ReactNode, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={active ? "is-active" : undefined}
      // 마우스다운에서 preventDefault — 클릭 시점에 에디터 선택 영역이 blur로 풀리지 않게 한다
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {icon}
    </button>
  );
  return (
    <div className="bubble-toolbar" role="toolbar" aria-label="서식">
      {btn("굵게", <Bold size={16} aria-hidden />, editor.isActive("bold"), () => editor.chain().focus().toggleBold().run())}
      {btn("기울임", <Italic size={16} aria-hidden />, editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run())}
      {btn("취소선", <Strikethrough size={16} aria-hidden />, editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run())}
      {btn("코드", <Code size={16} aria-hidden />, editor.isActive("code"), () => editor.chain().focus().toggleCode().run())}
      {btn("링크", <Link size={16} aria-hidden />, editor.isActive("link"), () => promptSetLink(editor))}
      {btn(
        "글자 색상",
        <Palette size={16} aria-hidden />,
        editor.isActive("textColor") || editor.isActive("bgColor") || paletteOpen,
        () => setPaletteOpen((v) => !v),
      )}
      {paletteOpen ? (
        <div className="color-palette" role="group" aria-label="색상 선택">
          <div className="color-palette-row" role="group" aria-label="글자색">
            {TEXT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-swatch color-swatch-txt txt-${color}`}
                aria-label={`${COLOR_LABELS[color]} 글자색`}
                aria-pressed={editor.isActive("textColor", { color })}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (editor.isActive("textColor", { color })) {
                    editor.chain().focus().unsetTextColor().run();
                  } else {
                    editor.chain().focus().setTextColor(color).run();
                  }
                }}
              >
                가
              </button>
            ))}
            <button
              type="button"
              className="color-swatch"
              aria-label="글자색 제거"
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().unsetTextColor().run();
              }}
            >
              ✕
            </button>
          </div>
          <div className="color-palette-row" role="group" aria-label="배경색">
            {BG_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-swatch color-swatch-bg bg-${color}`}
                aria-label={`${COLOR_LABELS[color]} 배경색`}
                aria-pressed={editor.isActive("bgColor", { color })}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (editor.isActive("bgColor", { color })) {
                    editor.chain().focus().unsetBgColor().run();
                  } else {
                    editor.chain().focus().setBgColor(color).run();
                  }
                }}
              >
                가
              </button>
            ))}
            <button
              type="button"
              className="color-swatch"
              aria-label="배경색 제거"
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().unsetBgColor().run();
              }}
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 선택 텍스트 위에 뜨는 서식 툴바.
 *
 * @tiptap/extension-bubble-menu(tippy.js 기반)는 CJS 기본 내보내기에 __esModule 마커가
 * 없어 일부 번들링 경로(vitest의 node_modules 외부화 포함)에서 default export가 함수가
 * 아닌 모듈 네임스페이스 객체로 잘못 interop되는 문제가 있다("tippy is not a function") —
 * 실제 브라우저에서도 재현 가능한 라이브러리 결함이라 의존을 피하고, 이미 이 파일에서
 * [[ 자동완성/슬래시 메뉴가 쓰는 clientRect 기반 위치 계산(SuggestionPopup과 동일 패턴)을
 * 그대로 재사용해 직접 구현한다 — 외부 포지셔닝 라이브러리 없이 에디터 transaction 이벤트로
 * 선택 영역의 DOMRect만 추적하면 충분하다.
 */
export function BubbleToolbar({ editor }: { editor: Editor }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const updatePosition = () => {
      const { selection } = editor.state;
      const { from, to } = selection;
      const isEmptyTextSelection = from === to || !editor.state.doc.textBetween(from, to).length;
      if (!editor.isFocused || isEmptyTextSelection || !editor.isEditable) {
        setRect(null);
        return;
      }
      setRect(posToDOMRect(editor.view, from, to));
    };
    const handleBlur = () => setRect(null);
    // "transaction"은 selectionUpdate를 포함해 모든 상태 변경마다 발화한다 — 별도 리스너 불필요.
    // blur는 자동완성/슬래시 메뉴와 동일하게 직접 닫는다(포커스만으로는 닫히지 않으므로).
    editor.on("transaction", updatePosition);
    editor.on("blur", handleBlur);
    return () => {
      editor.off("transaction", updatePosition);
      editor.off("blur", handleBlur);
    };
  }, [editor]);

  if (!rect) return null;

  return (
    <div
      className="bubble-toolbar-anchor"
      style={{ left: rect.left + rect.width / 2, top: rect.top }}
    >
      <ToolbarButtons editor={editor} />
    </div>
  );
}
