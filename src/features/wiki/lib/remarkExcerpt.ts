import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * 발췌 지시자 → 렌더 노드 매핑(W23). 형식·이스케이프 사정은 `lib/excerpt.ts` 참조.
 *
 * - `:::excerpt` 컨테이너 → `div.md-excerpt` (원본 문서에서 "이 부분이 발췌"임을 표시)
 * - `::excerpt-include[제목]` 리프 → `div.md-excerpt-include[data-title]` (MarkdownDiv가 실제 조회·렌더)
 *
 * remarkColumns보다 **먼저** 실행돼야 한다 — remarkColumns는 모르는 containerDirective를 div로
 * 덮어쓰는 폴백이 있어(details와 같은 사정) 순서로 이중 방어한다.
 */
export function remarkExcerpt() {
  return (tree: Root) => {
    visit(tree, (node) => {
      const directive = node as typeof node & {
        name?: string;
        children?: Array<{ type: string; data?: Record<string, unknown> }>;
        data?: { hName?: string; hProperties?: Record<string, unknown> };
      };
      if (node.type === "containerDirective" && directive.name === "excerpt") {
        const data = (directive.data ??= {});
        data.hName = "div";
        data.hProperties = { className: ["md-excerpt"] };
        return;
      }
      if (node.type === "leafDirective" && directive.name === "excerpt-include") {
        // 리프 지시자의 라벨(`[제목]`)은 컨테이너와 달리 문단으로 싸이지 않고 **자식 인라인 그대로**
        // 들어온다 — 텍스트를 모아 속성으로 옮기고 자식은 비운다.
        const title = ((directive.children ?? []) as Array<{ type: string; value?: string }>)
          .map((c) => (c.type === "text" ? (c.value ?? "") : ""))
          .join("")
          .trim();
        const data = (directive.data ??= {});
        data.hName = "div";
        data.hProperties = { className: ["md-excerpt-include"], "data-title": title };
        directive.children = [];
      }
    });
  };
}
