import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { isBgColor } from "../../lib/textColors";

export { BG_COLORS, isBgColor } from "../../lib/textColors";
export type { BgColorName } from "../../lib/textColors";
export {
  CELL_BG_MARKER_RE,
  CELL_TH_MARKER_RE,
  CELL_TH_MARKER,
  cellBgMarker,
} from "../../lib/tableCellMarkers";

/**
 * 표 셀 배경색(컨플루언스 cell shading) — 저장 문법은 셀 마커(2026-08-23 확정):
 *
 * ```
 * | {.bg-yellow} 강조 칸 | 일반 칸 |
 * ```
 *
 * 셀 내용 맨 앞의 `{.bg-<색>}` 마커가 셀 attrs.bgColor로 접히고(tableSpanBridge),
 * 직렬화 때 다시 마커로 펴진다. 병합 마커(`<<`/`^^`)와 같은 열화 원칙 — 이 문법을 모르는
 * GFM 렌더러에서는 표 구조가 유지된 채 마커 문자만 보인다. 팔레트는 텍스트 배경색과 같은
 * BG_COLORS(다크모드 토큰 검증 범위)만 받는다.
 */

const bgColorAttribute = {
  bgColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => {
      const v = el.getAttribute("data-bg-color");
      return v && isBgColor(v) ? v : null;
    },
    renderHTML: (attrs: { bgColor?: string | null }) => {
      if (!attrs.bgColor) return {};
      return { "data-bg-color": attrs.bgColor, class: `cell-bg-${attrs.bgColor}` };
    },
  },
};

export const ColorTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...bgColorAttribute };
  },
});

export const ColorTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...bgColorAttribute };
  },
});
