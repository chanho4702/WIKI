import type { Editor } from "@tiptap/core";
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Combine,
  Grid2x2,
  Minus,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";

export interface TableToolbarProps {
  editor: Editor;
}

/**
 * 표 컨트롤 바 (컨플루언스 참조) — 커서가 표 안일 때만 TopToolbar 아래에 뜨는 컨텍스트 바.
 * 행/열 추가·삭제, 셀 병합/분할, 표 삭제. 병합의 저장 문법은 tableSpanBridge.ts(스팬 마커)가
 * 담당하므로 여기서는 TipTap 표 명령만 부른다.
 *
 * mousedown preventDefault — 버튼 클릭이 에디터 선택(특히 병합에 필요한 셀 다중 선택)을
 * blur로 풀지 않게 한다(BubbleToolbar 규약).
 */
export function TableToolbar({ editor }: TableToolbarProps) {
  if (!editor.isActive("table")) return null;

  const btn = (label: string, icon: ReactNode, run: () => void, enabled = true) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!enabled}
      onMouseDown={(e) => {
        e.preventDefault();
        if (enabled) run();
      }}
    >
      {icon}
    </button>
  );

  return (
    <div className="table-toolbar" role="toolbar" aria-label="표 편집">
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
