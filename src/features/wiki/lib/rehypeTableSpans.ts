import { visit } from "unist-util-visit";
import { COLSPAN_MARKER, ROWSPAN_MARKER, foldSpanGrid, type SpanMarker } from "./tableSpans";
import { CELL_BG_MARKER_RE, isBgColor } from "../editor/extensions/tableCellColor";

/**
 * 표 셀 마커 보기 렌더 — 편집 경로(tableSpanBridge.ts)와 같은 fold 알고리즘.
 * ① 병합 마커(`<<`/`^^`): 소유 셀에 colSpan/rowSpan, 덮인 자리 제거.
 * ② 배경색 마커(`{.bg-색}` 접두): 마커를 지우고 셀에 cell-bg-* 클래스.
 *
 * mdast(remark) 단계가 아니라 **hast(rehype) 단계**에서 하는 이유: remark-gfm의 표 hast 변환이
 * 행을 열 수에 맞춰 빈 셀로 패딩하므로, mdast에서 지운 셀이 빈 td로 되살아난다(실측).
 * 마커를 모르는 GFM 렌더러에서는 파이프 구조가 유지된 채 마커 문자만 보인다(ADR의 열화 원칙).
 */

/* hast 타입 패키지가 직접 의존성에 없어(react-markdown 내부 전이) 구조적 최소 타입을 둔다 —
 * 이 플러그인이 실제로 만지는 필드만 선언한다. */
interface HastNode {
  type: string;
  value?: string;
  children?: HastNode[];
}
interface Element extends HastNode {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
}
type Node = HastNode;
type Root = HastNode;

function isElement(node: Node, tag?: string): node is Element {
  return node.type === "element" && (tag === undefined || (node as Element).tagName === tag);
}

function textOf(node: Node): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function markerOf(cell: Element): SpanMarker {
  // 마커 셀은 텍스트만 담는다 — 자식에 element(강조 등)가 섞이면 마커가 아니다
  if (cell.children.some((c) => c.type === "element")) return null;
  const text = textOf(cell).trim();
  if (text === COLSPAN_MARKER) return "col";
  if (text === ROWSPAN_MARKER) return "row";
  return null;
}

export function rehypeTableSpans() {
  return (tree: Root) => {
    visit(tree, "element", (node: Node) => {
      if (!isElement(node, "table")) return;
      // thead/tbody 아래 tr을 표 전체 그리드 순서로 모은다
      const rows: Element[] = [];
      for (const section of node.children) {
        if (!isElement(section)) continue;
        if (section.tagName === "tr") rows.push(section);
        else for (const tr of section.children) if (isElement(tr, "tr")) rows.push(tr);
      }
      const cellsOf = (tr: Element) =>
        tr.children.filter((c): c is Element => isElement(c, "th") || isElement(c, "td"));

      // 배경색 마커 먼저 — 셀 첫 텍스트의 `{.bg-색}` 접두를 지우고 클래스로 바꾼다
      for (const tr of rows) {
        for (const cell of cellsOf(tr)) {
          const first = cell.children[0] as { type: string; value?: string } | undefined;
          if (!first || first.type !== "text" || !first.value) continue;
          const m = CELL_BG_MARKER_RE.exec(first.value);
          if (!m || !isBgColor(m[1])) continue;
          first.value = first.value.slice(m[0].length);
          if (!first.value) cell.children.shift();
          const prev = cell.properties?.className;
          const classes = Array.isArray(prev) ? prev : prev ? [prev] : [];
          cell.properties = { ...cell.properties, className: [...classes, `cell-bg-${m[1]}`] };
        }
      }

      const markers = rows.map((tr) => cellsOf(tr).map(markerOf));
      const { spans, covered, changed } = foldSpanGrid(markers);
      if (!changed) return;

      const spanAt = new Map(spans.map((s) => [`${s.row}:${s.col}`, s]));
      rows.forEach((tr, r) => {
        let c = -1;
        tr.children = tr.children.filter((child) => {
          if (!isElement(child) || (child.tagName !== "th" && child.tagName !== "td")) return true;
          c += 1;
          if (covered[r][c]) return false;
          const span = spanAt.get(`${r}:${c}`);
          if (span && (span.colspan > 1 || span.rowspan > 1)) {
            child.properties = {
              ...child.properties,
              ...(span.colspan > 1 ? { colSpan: span.colspan } : {}),
              ...(span.rowspan > 1 ? { rowSpan: span.rowspan } : {}),
            };
          }
          return true;
        });
      });
    });
  };
}
