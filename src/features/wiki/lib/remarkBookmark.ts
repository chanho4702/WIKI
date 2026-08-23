import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * 링크 미리보기 카드 보기 렌더 — `::bookmark{url="..." title="..."}` 리프 지시자를
 * 카드형 앵커로 바꾼다(에디터 NodeView와 같은 구조·클래스). 문법 결정 근거는
 * editor/extensions/bookmarkCard.ts. url이 없으면 열화(내용 없음)로 무시한다.
 */
export function remarkBookmark() {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== "leafDirective") return;
      const directive = node as typeof node & {
        name: string;
        attributes?: Record<string, string | null | undefined>;
        data?: { hName?: string; hProperties?: Record<string, unknown>; hChildren?: unknown[] };
      };
      if (directive.name !== "bookmark") return;
      const url = directive.attributes?.url ?? "";
      if (!url) return;
      const title = directive.attributes?.title || url;
      const data = (directive.data ??= {});
      data.hName = "a";
      data.hProperties = {
        className: ["bookmark-card"],
        href: url,
        target: "_blank",
        rel: ["noreferrer", "noopener"],
      };
      data.hChildren = [
        {
          type: "element",
          tagName: "span",
          properties: { className: ["bookmark-card-title"] },
          children: [{ type: "text", value: title }],
        },
        {
          type: "element",
          tagName: "span",
          properties: { className: ["bookmark-card-url"] },
          children: [{ type: "text", value: url }],
        },
      ];
    });
  };
}
