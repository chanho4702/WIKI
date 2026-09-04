import { visit } from "unist-util-visit";

/**
 * `mermaid` 코드 블록 → 다이어그램 자리표시 div(W27-2).
 *
 * `<pre><code class="language-mermaid">`를 `div.md-mermaid[data-code]`로 바꾸고, 실제 렌더는
 * MarkdownView의 div 렌더러가 붙이는 `MermaidDiagram`이 한다 — `::excerpt-include`가
 * `div.md-excerpt-include[data-title]`로 바뀌고 컴포넌트가 조회·렌더하는 것과 같은 구조다.
 *
 * ## 왜 remark(mdast)가 아니라 rehype(hast)인가
 *
 * 코드 블록은 rehype-highlight가 토큰 span으로 잘게 쪼갠다 — 그 뒤에는 원문을 다시 모으기가
 * 어렵고, `mermaid`는 highlight.js에 등록된 언어가 아니라 경고까지 난다. rehype-highlight
 * **앞에서** 통째로 걷어내면 하이라이터가 이 블록을 아예 보지 않는다.
 */

/* hast 타입 패키지가 직접 의존성에 없어(react-markdown 내부 전이) 최소 구조 타입을 둔다 —
 * rehypeTableSpans.ts와 같은 사정이다. */
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

export const MERMAID_LANGUAGE_CLASS = "language-mermaid";

function isElement(node: HastNode, tag: string): node is Element {
  return node.type === "element" && (node as Element).tagName === tag;
}

function classListOf(node: Element): string[] {
  const raw = node.properties?.className;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(/\s+/);
  return [];
}

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

export function rehypeMermaid() {
  return (tree: HastNode) => {
    visit(tree, "element", (node: HastNode) => {
      if (!isElement(node, "pre")) return;
      const code = node.children.find((c) => isElement(c, "code")) as Element | undefined;
      if (!code || !classListOf(code).includes(MERMAID_LANGUAGE_CLASS)) return;
      const source = textOf(code).replace(/\n$/, "");
      node.tagName = "div";
      node.properties = { className: ["md-mermaid"], "data-code": source };
      node.children = [];
    });
  };
}
