import type { JSONContent } from "@tiptap/core";
import {
  COLSPAN_MARKER,
  ROWSPAN_MARKER,
  expandSpanGrid,
  foldSpanGrid,
  type SpanMarker,
} from "../lib/tableSpans";
import { CELL_BG_MARKER_RE, cellBgMarker, isBgColor, type BgColorName } from "./extensions/tableCellColor";

/**
 * 표 셀 마커 ↔ TipTap 셀 attrs 브리지 — 편집 경로.
 * ① 병합 마커(`<<`/`^^`) ↔ colspan/rowspan ② 배경색 마커(`{.bg-색}` 접두) ↔ bgColor.
 *
 * 저장 문법은 tableSpans.ts ADR(스팬 마커) 그대로다: GFM 파이프 구조를 유지한 채 병합으로
 * 덮인 자리를 마커 셀로 남긴다. 파싱 직후 fold(마커 셀 제거 + 소유 셀 attrs), 직렬화 직전
 * expand(attrs 해제 + 마커 셀 복원)를 돌려 왕복을 맞춘다. 보기 경로(remarkTableSpans.ts)는
 * 같은 fold 알고리즘을 mdast에 적용한다 — 두 화면이 같은 그리드 해석을 공유해야 한다.
 */

/** 셀 콘텐츠의 순수 텍스트 — 마커 판정용(문단 1개 + 텍스트만일 때만 마커로 본다). */
function cellText(cell: JSONContent): string {
  const content = cell.content ?? [];
  if (content.length !== 1 || content[0].type !== "paragraph") return "";
  const inline = content[0].content ?? [];
  if (inline.length !== 1 || inline[0].type !== "text" || inline[0].marks?.length) return "";
  return inline[0].text ?? "";
}

function markerOf(cell: JSONContent): SpanMarker {
  const text = cellText(cell).trim();
  if (text === COLSPAN_MARKER) return "col";
  if (text === ROWSPAN_MARKER) return "row";
  return null;
}

/** 셀 첫 문단 맨 앞의 `{.bg-색}` 마커를 attrs.bgColor로 접는다 — 없으면 원본 그대로. */
function foldCellColor(cell: JSONContent): JSONContent {
  const content = cell.content ?? [];
  const first = content[0];
  if (!first || first.type !== "paragraph") return cell;
  const inline = first.content ?? [];
  const firstText = inline[0];
  if (!firstText || firstText.type !== "text" || !firstText.text) return cell;
  const m = CELL_BG_MARKER_RE.exec(firstText.text);
  if (!m || !isBgColor(m[1])) return cell;
  const rest = firstText.text.slice(m[0].length);
  const newInline = rest ? [{ ...firstText, text: rest }, ...inline.slice(1)] : inline.slice(1);
  return {
    ...cell,
    attrs: { ...cell.attrs, bgColor: m[1] },
    content: [{ ...first, content: newInline }, ...content.slice(1)],
  };
}

/** attrs.bgColor를 `{.bg-색}` 마커 텍스트로 되돌린다 — 직렬화용. */
function expandCellColor(cell: JSONContent): JSONContent {
  const color = cell.attrs?.bgColor as string | null | undefined;
  if (!color || !isBgColor(color)) {
    if (cell.attrs && "bgColor" in cell.attrs) {
      const { bgColor: _b, ...rest } = cell.attrs;
      return { ...cell, attrs: rest };
    }
    return cell;
  }
  const { bgColor: _b, ...restAttrs } = cell.attrs ?? {};
  const marker = { type: "text", text: cellBgMarker(color as BgColorName) };
  const content = cell.content ?? [];
  const first = content[0];
  if (first && first.type === "paragraph") {
    return {
      ...cell,
      attrs: restAttrs,
      content: [{ ...first, content: [marker, ...(first.content ?? [])] }, ...content.slice(1)],
    };
  }
  return { ...cell, attrs: restAttrs, content: [{ type: "paragraph", content: [marker] }, ...content] };
}

function mapCells(table: JSONContent, fn: (cell: JSONContent) => JSONContent): JSONContent {
  return {
    ...table,
    content: (table.content ?? []).map((row) =>
      isTableRow(row) ? { ...row, content: (row.content ?? []).map(fn) } : row,
    ),
  };
}

function isTableRow(node: JSONContent): boolean {
  return node.type === "tableRow";
}

/** 표 하나를 접는다 — 마커가 없으면 원본 그대로 돌려준다(참조 유지, 불필요한 복사 없음). */
function foldTable(table: JSONContent): JSONContent {
  const rows = (table.content ?? []).filter(isTableRow);
  if (rows.length === 0) return table;
  const markers = rows.map((row) => (row.content ?? []).map(markerOf));
  const { spans, covered, changed } = foldSpanGrid(markers);
  if (!changed) return table;

  const spanAt = new Map(spans.map((s) => [`${s.row}:${s.col}`, s]));
  const content = rows.map((row, r) => {
    const cells = row.content ?? [];
    const kept = cells.flatMap((cell, c) => {
      if (covered[r][c]) return [];
      const span = spanAt.get(`${r}:${c}`);
      if (!span || (span.colspan === 1 && span.rowspan === 1)) return [cell];
      return [{ ...cell, attrs: { ...cell.attrs, colspan: span.colspan, rowspan: span.rowspan } }];
    });
    return { ...row, content: kept };
  });
  return { ...table, content };
}

/** 표 하나를 편다 — 스팬 attrs가 전혀 없으면 원본 그대로. */
function expandTable(table: JSONContent): JSONContent {
  const rows = (table.content ?? []).filter(isTableRow);
  const hasSpan = rows.some((row) =>
    (row.content ?? []).some(
      (cell) => (cell.attrs?.colspan ?? 1) > 1 || (cell.attrs?.rowspan ?? 1) > 1,
    ),
  );
  if (!hasSpan) return table;

  const grid = expandSpanGrid(
    rows.map((row) => row.content ?? []),
    (cell) => ({
      colspan: cell.attrs?.colspan ?? 1,
      rowspan: cell.attrs?.rowspan ?? 1,
    }),
  );
  const markerCell = (rowIndex: number, text: string): JSONContent => ({
    // 첫 행은 GFM 헤더 — 마커도 같은 셀 타입이어야 스키마가 유지된다
    type: rowIndex === 0 ? "tableHeader" : "tableCell",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  const content = grid.map((cells, r) => ({
    ...rows[r],
    content: cells.map((entry) => {
      if (entry.kind === "colMarker") return markerCell(r, COLSPAN_MARKER);
      if (entry.kind === "rowMarker") return markerCell(r, ROWSPAN_MARKER);
      const cell = entry.payload as JSONContent;
      // attrs를 1로 되돌린다 — 직렬화 그리드는 마커가 자리를 대신한다
      const { colspan: _c, rowspan: _r, ...rest } = cell.attrs ?? {};
      return { ...cell, attrs: { ...rest, colspan: 1, rowspan: 1 } };
    }),
  }));
  return { ...table, content };
}

function walkTables(node: JSONContent, transform: (table: JSONContent) => JSONContent): JSONContent {
  if (node.type === "table") return transform(node);
  if (!node.content) return node;
  return { ...node, content: node.content.map((child) => walkTables(child, transform)) };
}

/** 파싱 직후: 배경색 마커 → attrs, 병합 마커 셀 → colspan/rowspan 순서로 접는다
 * (색을 먼저 접어야 `{.bg-색} <<` 같은 조합 없이 스팬 판정이 순수 텍스트를 본다). */
export function foldTableSpans(doc: JSONContent): JSONContent {
  return walkTables(doc, (table) => foldTable(mapCells(table, foldCellColor)));
}

/** 직렬화 직전: 스팬을 마커 그리드로 편 뒤 배경색 attrs를 마커 텍스트로 되돌린다. */
export function expandTableSpans(doc: JSONContent): JSONContent {
  return walkTables(doc, (table) => mapCells(expandTable(table), expandCellColor));
}
