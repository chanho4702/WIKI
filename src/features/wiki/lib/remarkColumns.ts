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
export function remarkColumns() {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== "containerDirective") return;

      // mdast의 directive 노드 타입은 remark-directive가 확장한 것이라 여기서만 좁힌다
      const directive = node as typeof node & {
        name: string;
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
      data.hProperties = className ? { className: [className] } : {};
    });
  };
}
