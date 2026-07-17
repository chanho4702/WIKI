import { useEffect, useState } from "react";
import { posToDOMRect } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

/** 버튼 행 — 위치 계산과 분리해 jsdom에서 단독 테스트 가능하게 한다(좌표 계산 없이 버튼 동작만 검증) */
export function ToolbarButtons({ editor }: { editor: Editor }) {
  const setLink = () => {
    const url = window.prompt("링크 URL을 입력하세요", editor.getAttributes("link").href ?? "");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };
  const btn = (label: string, glyph: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={active ? "is-active" : undefined}
      // 마우스다운에서 preventDefault — 클릭 시점에 에디터 선택 영역이 blur로 풀리지 않게 한다
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {glyph}
    </button>
  );
  return (
    <div className="bubble-toolbar" role="toolbar" aria-label="서식">
      {btn("굵게", "B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run())}
      {btn("기울임", "I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run())}
      {btn("취소선", "S", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run())}
      {btn("코드", "<>", editor.isActive("code"), () => editor.chain().focus().toggleCode().run())}
      {btn("링크", "🔗", editor.isActive("link"), setLink)}
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
