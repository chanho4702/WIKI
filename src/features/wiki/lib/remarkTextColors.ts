import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { isBgColor, isTextColor } from "../editor/extensions/textColors";

/**
 * 글자색·배경색 보기 렌더 — remark-directive의 텍스트 지시자(`:c[..]{.red}`, `:bg[..]{.yellow}`)를
 * 에디터와 같은 클래스의 span으로 바꾼다. 문법 결정 근거는 editor/extensions/textColors.ts.
 * 팔레트 밖 색 이름은 스타일 없이 내용만 통과시킨다 — 내용이 사라지는 게 최악의 실패다.
 */
export function remarkTextColors() {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== "textDirective") return;
      const directive = node as typeof node & {
        name: string;
        attributes?: Record<string, string | null | undefined>;
        data?: { hName?: string; hProperties?: Record<string, unknown> };
      };
      if (directive.name !== "c" && directive.name !== "bg") return;

      // remark-directive는 `{.red}`를 class 속성으로 넘긴다
      const color = (directive.attributes?.class ?? "").trim();
      const valid = directive.name === "c" ? isTextColor(color) : isBgColor(color);
      const data = (directive.data ??= {});
      data.hName = "span";
      data.hProperties = valid
        ? directive.name === "c"
          ? { className: [`txt-${color}`], "data-text-color": color }
          : { className: [`bg-${color}`], "data-bg-color": color }
        : {};
    });
  };
}
