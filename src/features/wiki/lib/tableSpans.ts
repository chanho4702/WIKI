/**
 * 표 셀 병합의 저장 문법 — 스팬 마커 (에디터 상세 갭 분석 §5 ADR, 2026-08-23 확정).
 *
 * GFM 표는 colspan/rowspan을 표현할 수 없고, tiptap-markdown의 기본 폴백(HTML 표 직렬화)은
 * 이 리포의 `html: false` XSS 정책과 충돌한다. 대신 병합으로 **덮인 자리**를 마커 셀로 남긴다:
 *
 * ```
 * | 병합 셀 | << | 오른쪽 |
 * | ---     | ---| ---    |
 * | ^^      | ^^ | 값     |
 * ```
 *
 * - `<<` = 왼쪽 셀에 흡수(colspan), `^^` = 위 셀에 흡수(rowspan).
 * - 표의 파이프 구조(행마다 셀 수 동일)가 유지되므로 **GFM 렌더러에서 표가 깨지지 않고**
 *   마커 문자가 보이는 정도로 열화된다 — `:::` 확장 문법과 같은 열화 원칙.
 * - 편집(markdown-it 파싱 후 JSON 후처리)과 보기(remark-gfm 후처리)가 이 모듈의 같은
 *   그리드 알고리즘을 써야 두 화면이 어긋나지 않는다.
 *
 * 알려진 한계(문서화된 트레이드오프): 셀 본문이 정확히 `<<`/`^^`뿐이면 병합 마커로 해석된다.
 * 일반 텍스트로 쓰려면 다른 문자를 섞어야 한다.
 */

export const COLSPAN_MARKER = "<<";
export const ROWSPAN_MARKER = "^^";

export type SpanMarker = "col" | "row" | null;

export interface CellSpan {
  /** 소유 셀의 (파싱 그리드 기준) 행·열 */
  row: number;
  col: number;
  colspan: number;
  rowspan: number;
}

export interface FoldResult {
  /** 소유 셀 목록(그리드 좌상단 순). covered 위치는 포함되지 않는다. */
  spans: CellSpan[];
  /** covered[r][c] = true면 그 자리는 다른 셀에 흡수돼 최종 표에서 사라진다. */
  covered: boolean[][];
  /** 마커가 하나라도 유효하게 접혔는가 — false면 호출부가 표를 건드릴 필요가 없다. */
  changed: boolean;
}

/**
 * 마커 그리드를 스팬으로 접는다. 유효하지 않은 마커(왼쪽/위 이웃이 없거나 직사각형이
 * 깨지는 자리)는 병합하지 않고 일반 셀로 남긴다 — 문서를 임의로 지우는 것이 최악의 실패다.
 */
export function foldSpanGrid(markers: SpanMarker[][]): FoldResult {
  const rows = markers.length;
  const owners: { r: number; c: number }[][] = markers.map((row) => row.map((_, c) => ({ r: -1, c })));
  const spans = new Map<string, CellSpan>();
  const key = (r: number, c: number) => `${r}:${c}`;
  let changed = false;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < markers[r].length; c++) {
      const marker = markers[r][c];

      if (marker === "col" && c > 0) {
        const owner = owners[r][c - 1];
        const span = spans.get(key(owner.r, owner.c));
        // colspan은 소유 셀의 첫 행에서, 블록의 오른쪽 끝에 이어질 때만 늘어난다(직사각형 유지)
        if (span && owner.r === r && c === owner.c + span.colspan) {
          span.colspan += 1;
          owners[r][c] = owner;
          changed = true;
          continue;
        }
      }

      if (marker === "row" && r > 0 && c < markers[r - 1].length) {
        const owner = owners[r - 1][c];
        const span = spans.get(key(owner.r, owner.c));
        if (span && c >= owner.c && c < owner.c + span.colspan) {
          if (c === owner.c && r === owner.r + span.rowspan) {
            // 블록 시작 열 — 여기서만 rowspan을 늘린다(열마다 중복 증가 방지)
            span.rowspan += 1;
            owners[r][c] = owner;
            changed = true;
            continue;
          }
          if (c > owner.c && r < owner.r + span.rowspan) {
            // 시작 열에서 이미 확장된 행의 나머지 열 — 같은 블록에 흡수만 한다
            owners[r][c] = owner;
            changed = true;
            continue;
          }
        }
      }

      owners[r][c] = { r, c };
      spans.set(key(r, c), { row: r, col: c, colspan: 1, rowspan: 1 });
    }
  }

  const covered = markers.map((row, r) => row.map((_, c) => owners[r][c].r !== r || owners[r][c].c !== c));
  return { spans: [...spans.values()], covered, changed };
}

export type ExpandedCell<T> =
  | { kind: "cell"; payload: T; row: number; index: number }
  | { kind: "colMarker" }
  | { kind: "rowMarker" };

/**
 * 스팬이 있는 표(행마다 소유 셀만 존재)를 마커가 채워진 완전 그리드로 편다 — 직렬화용.
 * `cells[r][i]`는 r행의 i번째 소유 셀 payload, `spanOf`가 그 셀의 스팬을 알려준다.
 */
export function expandSpanGrid<T>(
  cells: T[][],
  spanOf: (payload: T) => { colspan: number; rowspan: number },
): ExpandedCell<T>[][] {
  const grid: (ExpandedCell<T> | undefined)[][] = [];
  const ensureRow = (r: number) => (grid[r] ??= []);

  cells.forEach((row, r) => {
    ensureRow(r);
    let c = 0;
    row.forEach((payload, index) => {
      while (grid[r][c] !== undefined) c += 1; // rowspan이 미리 채운 자리 건너뛰기
      const { colspan, rowspan } = spanOf(payload);
      grid[r][c] = { kind: "cell", payload, row: r, index };
      for (let dc = 1; dc < colspan; dc++) grid[r][c + dc] = { kind: "colMarker" };
      for (let dr = 1; dr < rowspan; dr++) {
        ensureRow(r + dr);
        for (let dc = 0; dc < colspan; dc++) grid[r + dr][c + dc] = { kind: "rowMarker" };
      }
      c += colspan;
    });
  });

  return grid.map((row) => row.map((cell) => cell ?? { kind: "rowMarker" }));
}
