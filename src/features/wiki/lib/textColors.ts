/** 글자색 팔레트 — CSS 클래스 `txt-<이름>`이 라이트/다크 값을 정의한다(스펙트럼 순).
 * 노랑 글자는 흰 배경 대비 때문에 황토 톤(#7f5f01) — 순색 노랑은 4.5:1을 못 넘는다. */
export const TEXT_COLORS = [
  "gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "magenta",
] as const;
/** 배경색 팔레트 — CSS 클래스 `bg-<이름>`. 표 셀 배경(cell-bg-*)도 같은 목록을 쓴다. */
export const BG_COLORS = [
  "gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "magenta",
] as const;

export type TextColorName = (typeof TEXT_COLORS)[number];
export type BgColorName = (typeof BG_COLORS)[number];

const TEXT_COLOR_SET = new Set<string>(TEXT_COLORS);
const BG_COLOR_SET = new Set<string>(BG_COLORS);

export function isTextColor(value: string): value is TextColorName {
  return TEXT_COLOR_SET.has(value);
}
export function isBgColor(value: string): value is BgColorName {
  return BG_COLOR_SET.has(value);
}
