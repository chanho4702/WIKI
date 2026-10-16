import type { BgColorName } from "./textColors";

export const CELL_BG_MARKER_RE = /^\{\.bg-([a-z]+)\}\s?/;

export function cellBgMarker(color: BgColorName): string {
  return `{.bg-${color}} `;
}

/** 헤더 열 마커 — 본문 행의 셀을 th로 만든다(컨플 헤더 열). 첫 행(GFM 헤더)은 마커 불필요. */
export const CELL_TH_MARKER_RE = /^\{\.th\}\s?/;
export const CELL_TH_MARKER = "{.th} ";
