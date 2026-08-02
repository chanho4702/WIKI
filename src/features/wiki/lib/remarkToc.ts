import type { Paragraph, Root, Text } from "mdast";
import { visit } from "unist-util-visit";

/**
 * 본문 목차(`::toc`) — 문서 안에 목차 블록을 심는다.
 *
 * ## 저장 포맷
 *
 * remark-directive의 **리프 지시자** `::toc` 한 줄. 컬럼(`:::columns`)과 같은 문법 가족이라
 * 새 개념을 들이지 않고, `Page.body`는 계속 마크다운 문자열이다(CLAUDE.md 불변조건 2).
 * 이 문법을 모르는 렌더러에서는 `::toc` 텍스트 한 줄로 보인다 — 내용 손실은 없다.
 *
 * ## 왜 텍스트 폴백까지 보는가
 *
 * 편집기(markdown-it)는 `::toc`를 모른다 — 그래서 편집 화면에서는 지시자가 아니라 그냥
 * 텍스트 문단으로 남고, 저장할 때도 텍스트로 직렬화된다. 패널(`[!NOTE]`)이 편집 화면에
 * 마커를 그대로 노출하는 것과 같은 구조다. 다만 직렬화기가 콜론을 이스케이프하면
 * (`\:\:toc`) 보기 쪽 지시자 파싱이 실패하므로, 텍스트 문단 형태도 함께 인식한다.
 */

/** `::toc` 한 줄만으로 이루어진 문단인지 — 이스케이프 저장형(`\:\:toc`)도 같이 본다. */
const TOC_TEXT_RE = /^\\?:\\?:toc\s*$/;

function isTocParagraph(node: Paragraph): boolean {
  if (node.children.length !== 1) return false;
  const only = node.children[0];
  if (only.type !== "text") return false;
  return TOC_TEXT_RE.test((only as Text).value.trim());
}

export function remarkToc() {
  return (tree: Root) => {
    // 지시자로 파싱된 경우(보기 경로에서 remark-directive가 먼저 돈다).
    // directive 노드 타입은 remark-directive가 확장한 것이라 remarkColumns와 같은 방식으로 좁힌다.
    visit(tree, (node) => {
      if (node.type !== "leafDirective") return;
      const directive = node as typeof node & {
        name: string;
        data?: { hName?: string; hProperties?: Record<string, unknown> };
      };
      if (directive.name !== "toc") return;
      const data = (directive.data ??= {});
      data.hName = "div";
      data.hProperties = { className: ["md-toc"] };
    });

    // 텍스트로 남은 경우(편집기 왕복 후) — 같은 결과로 맞춘다
    visit(tree, "paragraph", (node: Paragraph) => {
      if (!isTocParagraph(node)) return;
      node.children = [];
      node.data = {
        ...node.data,
        hName: "div",
        hProperties: { className: ["md-toc"] },
      };
    });
  };
}
