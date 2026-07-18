import { Node, nodeInputRule } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Page } from "../../store/types";
import { WIKI_LINK_SOURCE } from "../../lib/wikiLinks";

export interface WikiLinkOptions {
  /** 존재/부재 판별용 — WikiEditor가 최신 pages를 ref로 공급한다 */
  getPages: () => Page[];
}

/**
 * 존재/부재 판별용 제목 정규화 — wikiLinks.ts(뷰 쪽 렌더링)의 `title.trim().toLowerCase()`와
 * 동일 규약을 따른다. 두 쪽이 다르게 정규화하면 에디터 칩과 뷰 링크의 판정이 어긋난다.
 */
export function normalizeWikiLinkTitle(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * [[제목]] 인라인 원자 노드.
 * - 에디터 안에서는 칩으로 렌더 (부재 페이지는 데코레이션으로 .wiki-chip-missing 부여)
 * - 마크다운 직렬화는 tiptap-markdown 확장 스토리지 규약(storage.markdown.serialize) 사용
 * - 타이핑 "[[제목]]" 완성 시 inputRule로 노드 승격
 */
export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return { getPages: () => [] };
  },

  addAttributes() {
    return { title: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "span[data-wiki-link]", getAttrs: (el) => ({ title: (el as HTMLElement).dataset.title ?? "" }) }];
  },

  renderHTML({ node }) {
    return [
      "span",
      { "data-wiki-link": "", "data-title": node.attrs.title, class: "wiki-chip" },
      node.attrs.title,
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.title}]]`;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void }, node: { attrs: { title: string } }) {
          state.write(`[[${node.attrs.title}]]`);
        },
      },
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        // WIKI_LINK_SOURCE에서 가져온 패턴 — [, ], 개행 미포함 제목만, $ 앵커 붙음
        find: new RegExp(WIKI_LINK_SOURCE + "$"),
        type: this.type,
        getAttributes: (match) => ({ title: match[1] }),
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { getPages } = this.options;
    return [
      new Plugin({
        props: {
          decorations(state) {
            const titles = new Set(getPages().map((p) => normalizeWikiLinkTitle(p.title)));
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === "wikiLink" && !titles.has(normalizeWikiLinkTitle(node.attrs.title))) {
                decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "wiki-chip-missing" }));
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
