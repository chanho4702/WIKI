import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * 레이어 분할(컬럼) 보기 렌더 — remark-directive가 만든 컨테이너 지시자
 * (`::::columns` / `:::column`)를 에디터와 같은 클래스의 div로 바꾼다.
 *
 * 저장 포맷 결정과 문법 근거는 `../editor/extensions/columns.ts` 참조. 편집 경로는
 * markdown-it 컨테이너 규칙이, 보기 경로는 이 플러그인이 담당하며 **같은 문자열을 같은
 * 구조로** 읽어야 편집↔보기가 어긋나지 않는다.
 *
 * remark-directive는 문법(`:::name`)만 mdast 노드로 만들어주고 HTML 매핑은 하지 않는다 —
 * `data.hName`/`data.hProperties`를 채우는 게 사용처의 몫이다(플러그인 공식 사용법).
 * 이름이 columns/column이 아닌 지시자는 손대지 않는다: 그러면 mdast-util-to-hast가
 * 알 수 없는 노드로 두어 렌더에서 조용히 빠지므로, 아래에서 원문 텍스트로 되돌려 준다.
 */
/** `{width=30}` 속성값 → 30. 범위를 벗어나거나 숫자가 아니면 null(균등 분배). */
function parseColumnWidth(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value >= 100) return null;
  return Math.round(value * 10) / 10;
}

export function remarkColumns() {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== "containerDirective") return;
      // details는 remarkDetails 담당 — 여기 폴백(div 덮어쓰기)에 걸리면 <details>가 사라진다
      if ((node as { name?: string }).name === "details") return;
      // 앞선 플러그인이 이미 렌더 노드를 정했으면(excerpt·properties 등) 그 결정을 지우지 않는다(W23).
      // 이름을 하나씩 나열하면 새 지시자를 더할 때마다 여기도 고쳐야 한다 — "처리됐는가"로 본다.
      if ((node as { data?: { hName?: string } }).data?.hName) return;

      // mdast의 directive 노드 타입은 remark-directive가 확장한 것이라 여기서만 좁힌다
      const directive = node as typeof node & {
        name: string;
        attributes?: Record<string, string | null | undefined>;
        data?: { hName?: string; hProperties?: Record<string, unknown> };
      };

      const className =
        directive.name === "columns"
          ? "md-columns"
          : directive.name === "column"
            ? "md-column"
            : null;

      // 우리가 모르는 지시자(`:::info` 등)는 렌더에서 사라지지 않게 평범한 div로 통과시킨다 —
      // 내용이 조용히 증발하는 것이 사용자에게 가장 나쁜 실패다.
      const data = (directive.data ??= {});
      data.hName = "div";
      if (!className) {
        data.hProperties = {};
        return;
      }

      // `:::column{width=30}` — remark-directive가 attributes로 넘겨준 값을 편집 화면과 같은
      // CSS 변수로 흘린다. 편집(`--wiki-column-width` 인라인 스타일)과 값이 갈리면
      // 저장 후 화면이 편집 중과 달라진다.
      if (directive.name === "columns") {
        // 편집 화면의 ColumnBlock.renderHTML과 같은 값 — 열 너비에서 gap 몫을 빼는 데 쓴다
        const count = (directive as { children?: unknown[] }).children?.length ?? 0;
        data.hProperties = { className: [className], style: `--wiki-column-count:${count}` };
        return;
      }

      const width = parseColumnWidth(directive.attributes?.width);
      data.hProperties =
        width === null
          ? { className: [className] }
          : {
              className: [className],
              "data-width": String(width),
              style: `--wiki-column-width:${width}%`,
            };
    });
  };
}
