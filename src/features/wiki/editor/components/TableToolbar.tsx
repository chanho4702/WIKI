import { useEffect, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Combine,
  Grid2x2,
  Minus,
  PaintBucket,
  Trash2,
} from "lucide-react";
import { BG_COLORS } from "../extensions/textColors";
import { ColorSwatchGrid } from "./ColorPalette";

export interface TableToolbarProps {
  editor: Editor;
}

/** 선택 위치가 속한 table DOM — 플로팅 메뉴의 앵커. */
function activeTableDom(editor: Editor): HTMLElement | null {
  if (!editor.isActive("table")) return null;
  const { node } = editor.view.domAtPos(editor.state.selection.from);
  const el = node instanceof Element ? node : node.parentElement;
  return (el?.closest("table") as HTMLElement | null) ?? null;
}

/**
 * 표 플로팅 컨트롤 바(컨플루언스 참조) — 커서가 표 안일 때 그 표의 바로 위에 붙는다.
 * 이전에는 에디터 상단 전체 너비 줄이었는데 표와 떨어져 있어 "행·열 추가 기능이 없다"고
 * 읽혔다(사용자 불합격 피드백 2026-08-23) — 컨트롤은 대상 옆에 있어야 발견된다.
 *
 * 구성: 열 추가/삭제 · 행 추가/삭제 · 셀 배경색(선택 셀들에 적용) · 셀 병합/해제 · 표 삭제.
 * mousedown preventDefault — 버튼 클릭이 셀 다중 선택을 blur로 풀지 않게(BubbleToolbar 규약).
 */
export function TableToolbar({ editor }: TableToolbarProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const update = () => {
      const table = activeTableDom(editor);
      if (!table || !editor.isEditable) {
        setRect(null);
        setPaletteOpen(false);
        return;
      }
      setRect(table.getBoundingClientRect());
    };
    update();
    editor.on("transaction", update);
    editor.on("blur", update);
    return () => {
      editor.off("transaction", update);
      editor.off("blur", update);
    };
  }, [editor]);

  if (!rect) return null;

  const btn = (label: string, icon: ReactNode, run: () => void, enabled = true, pressed?: boolean) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!enabled}
      aria-pressed={pressed}
      className={pressed ? "is-active" : undefined}
      onMouseDown={(e) => {
        e.preventDefault();
        if (enabled) run();
      }}
    >
      {icon}
    </button>
  );

  // 표 상단에 붙인다 — 위 공간이 모자라면(스크롤로 표 상단이 화면 밖) 표 위 경계 안쪽으로 내린다
  const top = Math.max(rect.top - 40, 60);
  const left = Math.max(rect.left, 8);

  const activeCellBg =
    BG_COLORS.find((c) => editor.isActive("tableCell", { bgColor: c }) || editor.isActive("tableHeader", { bgColor: c })) ??
    null;

  return (
    <div className="table-toolbar" role="toolbar" aria-label="표 편집" style={{ top, left }}>
      {btn("왼쪽에 열 추가", <BetweenVerticalStart size={16} aria-hidden />, () =>
        editor.chain().focus().addColumnBefore().run(),
      )}
      {btn("오른쪽에 열 추가", <BetweenVerticalEnd size={16} aria-hidden />, () =>
        editor.chain().focus().addColumnAfter().run(),
      )}
      {btn("열 삭제", <Minus size={16} aria-hidden />, () =>
        editor.chain().focus().deleteColumn().run(),
      )}
      <span className="table-toolbar-divider" aria-hidden="true" />
      {btn("위에 행 추가", <BetweenHorizontalStart size={16} aria-hidden />, () =>
        editor.chain().focus().addRowBefore().run(),
      )}
      {btn("아래에 행 추가", <BetweenHorizontalEnd size={16} aria-hidden />, () =>
        editor.chain().focus().addRowAfter().run(),
      )}
      {btn("행 삭제", <Minus size={16} aria-hidden />, () =>
        editor.chain().focus().deleteRow().run(),
      )}
      <span className="table-toolbar-divider" aria-hidden="true" />
      <span className="table-toolbar-palette-anchor">
        {btn(
          "셀 배경색",
          <PaintBucket size={16} aria-hidden />,
          () => setPaletteOpen((v) => !v),
          true,
          paletteOpen || activeCellBg !== null,
        )}
        {paletteOpen ? (
          <div className="color-palette" role="group" aria-label="셀 배경색 선택">
            <ColorSwatchGrid
              label="셀 배경"
              colors={BG_COLORS}
              varPrefix="bg"
              activeColor={activeCellBg}
              clearLabel="셀 배경 제거"
              onPick={(color) => {
                editor.chain().focus().setCellAttribute("bgColor", color).run();
              }}
            />
          </div>
        ) : null}
      </span>
      <span className="table-toolbar-divider" aria-hidden="true" />
      {/* 병합은 셀 다중 선택(드래그)이 있어야 활성 — can()으로 판정 */}
      {btn(
        "셀 병합",
        <Combine size={16} aria-hidden />,
        () => editor.chain().focus().mergeCells().run(),
        editor.can().mergeCells(),
      )}
      {btn(
        "병합 해제",
        <Grid2x2 size={16} aria-hidden />,
        () => editor.chain().focus().splitCell().run(),
        editor.can().splitCell(),
      )}
      <span className="table-toolbar-divider" aria-hidden="true" />
      {btn("표 삭제", <Trash2 size={16} aria-hidden />, () =>
        editor.chain().focus().deleteTable().run(),
      )}
    </div>
  );
}
