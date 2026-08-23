import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * `::toc` 라이브 프리뷰 — alertDecoration과 같은 방식. 마커 텍스트는 편집 가능해야 하므로
 * 지우지 않고, 문단에 칩 스타일과 안내 라벨(CSS ::after)만 덧씌운다. 이게 없으면 슬래시
 * 메뉴로 목차를 넣어도 원문 `::toc`만 보여서 "기능이 없다"로 읽힌다(휴리스틱 #1 상태 가시성).
 */
export const TocDecoration = Extension.create({
  name: "tocDecoration",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "paragraph") return;
              if (node.childCount !== 1) return;
              const text = node.firstChild;
              if (!text || !text.isText || text.text?.trim() !== "::toc") return;
              decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "toc-marker" }));
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
