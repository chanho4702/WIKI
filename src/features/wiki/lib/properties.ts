import { normalizeDirectiveEscapes } from "./excerpt";

/**
 * 페이지 속성(`:::properties` 안의 2열 표, W23)을 읽는다 — 속성 보고서(`::properties-report[라벨]`)가
 * 라벨이 붙은 문서들의 이 표를 한 표로 모은다(컨플루언스 Page Properties Report).
 *
 * 저장 포맷은 그대로 마크다운 표다. 여기서는 렌더하지 않고 "키 → 값 문자열"만 뽑는다 — 보고서 셀에
 * 본문 렌더러를 통째로 넣으면 문서 수만큼 무거워진다.
 */
export interface PageProperty {
  key: string;
  value: string;
}

const OPEN_RE = /^:{3,}[ \t]*properties[ \t]*$/;
const CLOSE_RE = /^:{3,}[ \t]*$/;

/** 첫 `:::properties` 블록의 행들. 블록이 없으면 null — "속성이 없는 문서"와 "빈 표"를 구분한다. */
export function extractProperties(markdown: string): PageProperty[] | null {
  const lines = normalizeDirectiveEscapes(markdown).split("\n");
  const start = lines.findIndex((l) => OPEN_RE.test(l));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => CLOSE_RE.test(l));
  const block = end < 0 ? rest : rest.slice(0, end);

  const rows = block
    .filter((l) => /^\s*\|.*\|\s*$/.test(l))
    .map((l) => l.trim().slice(1, -1).split("|").map((c) => c.trim()));
  const isSeparator = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));

  const out: PageProperty[] = [];
  rows.forEach((cells, i) => {
    if (isSeparator(cells)) return;
    // 머리글 행("항목 | 값")은 표를 만들려고 있는 것이지 속성이 아니다 — 바로 아래가 구분선이면 머리글
    if (i === 0 && rows[1] !== undefined && isSeparator(rows[1])) return;
    if (cells.length >= 2 && cells[0] !== "") out.push({ key: cells[0], value: cells[1] ?? "" });
  });
  return out;
}

/** 셀 값의 인라인 마크다운을 글자로 — 상태 배지는 이름만, 링크는 텍스트만, 강조 기호는 뗀다. */
export function plainValue(value: string): string {
  return value
    .replace(/:status\[([^\]]*)\](?:\{[^}]*\})?/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}
