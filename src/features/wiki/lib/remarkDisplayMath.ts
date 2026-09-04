import type { Paragraph, Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * `$$…$$` 한 줄을 블록(display) 수식으로 되돌린다(W27-2).
 *
 * ## 왜 필요한가
 *
 * 저장 포맷의 블록 수식은 세 줄(`$$` / 본문 / `$$`)이고 remark-math가 그대로 display로 읽는다.
 * 그런데 편집기(markdown-it)는 이 세 줄을 **한 문단**으로 본다 — 줄바꿈이 softbreak이라
 * 직렬화하면 `$$ E = mc^2 $$` 한 줄이 된다(editor/markdown.test.ts의 왕복 케이스가 이 형태다).
 * 한 줄이 되면 remark-math는 인라인 수식으로 읽어서, 문서를 한 번 편집했을 뿐인데 가운데 정렬된
 * 수식이 문장 속 작은 수식으로 바뀐다.
 *
 * 그래서 **문단 전체가 `$$`로 감싼 수식 하나뿐일 때만** display로 승격한다. 문장 중간의
 * `$x$`(인라인)는 건드리지 않는다 — 구분은 원문의 여는 구분자가 `$` 하나인지 둘인지로 한다.
 *
 * ## 왜 텍스트 치환이 아니라 mdast 단계인가
 *
 * 원문을 `$$\n…\n$$`로 되돌리면 줄 수가 바뀐다. MarkdownView의 작업 체크박스(W23)는 li의 원문
 * 줄 번호로 서버에 토글을 보내므로, 보기 경로의 정규화가 줄 수를 바꾸면 엉뚱한 줄이 토글된다.
 */

/** mdast-util-math가 인라인 수식에 붙이는 hast 매핑 — 클래스만 display로 바꾼다. */
interface InlineMathNode {
  type: string;
  position?: { start?: { offset?: number } };
  data?: { hName?: string; hProperties?: { className?: unknown } };
}

const DISPLAY_CLASSES = ["language-math", "math-display"];

export function remarkDisplayMath() {
  return (tree: Root, file: { value?: unknown }) => {
    const source = typeof file?.value === "string" ? file.value : "";

    visit(tree, "paragraph", (node: Paragraph) => {
      if (node.children.length !== 1) return;
      const only = node.children[0] as unknown as InlineMathNode;
      if (only.type !== "inlineMath") return;
      // 여는 구분자가 `$$`인 것만 승격한다 — mdast는 `$x$`와 `$$x$$`를 같은 노드로 만든다
      const offset = only.position?.start?.offset;
      if (typeof offset !== "number" || source.slice(offset, offset + 2) !== "$$") return;
      const data = (only.data ??= {});
      data.hProperties = { ...(data.hProperties ?? {}), className: DISPLAY_CLASSES };
    });
  };
}
