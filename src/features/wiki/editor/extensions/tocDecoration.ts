import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * `::toc` 라이브 목차 — 마커 문단은 편집 가능하게 남기고(칩 스타일), 바로 아래에 현재 문서의
 * 제목들로 만든 실제 목차를 위젯 데코레이션으로 그린다. 데코레이션은 문서가 바뀔 때마다
 * 다시 계산되므로 제목을 추가·수정하면 목차도 즉시 갱신된다("보기에서만 보인다"는 이전
 * 동작에 대한 피드백 반영 — 편집 중에도 결과가 바로 보여야 한다).
 *
 * 항목 클릭 시 해당 제목으로 커서를 옮기고 스크롤한다. 위젯은 contentEditable=false라
 * 본문 편집·마크다운 직렬화에 영향을 주지 않는다.
 */

interface HeadingRef {
  level: number;
  text: string;
  pos: number;
}

function collectHeadings(doc: ProseMirrorNode): HeadingRef[] {
  const out: HeadingRef[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.attrs.level <= 3 && node.textContent.trim()) {
      out.push({ level: node.attrs.level as number, text: node.textContent, pos });
    }
    return true;
  });
  return out;
}

function buildTocWidget(view: EditorView, headings: HeadingRef[]): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "page-toc page-toc--inline toc-live";
  nav.setAttribute("aria-label", "목차 미리보기");
  nav.contentEditable = "false";

  if (headings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "page-toc-empty";
    empty.textContent = "제목을 추가하면 목차가 만들어집니다.";
    nav.appendChild(empty);
    return nav;
  }

  const list = document.createElement("ul");
  for (const heading of headings) {
    const item = document.createElement("li");
    item.className = `page-toc-level-${heading.level}`;
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = heading.text;
    link.addEventListener("mousedown", (event) => {
      // 편집 중 클릭 — 제목 위치로 커서 이동 + 스크롤(기본 앵커 내비게이션은 막는다)
      event.preventDefault();
      const selection = TextSelection.near(view.state.doc.resolve(heading.pos + 1));
      view.dispatch(view.state.tr.setSelection(selection));
      const dom = view.domAtPos(heading.pos + 1).node;
      const el = dom instanceof HTMLElement ? dom : dom.parentElement;
      el?.scrollIntoView?.({ block: "start", behavior: "smooth" });
      view.focus();
    });
    item.appendChild(link);
    list.appendChild(item);
  }
  nav.appendChild(list);
  return nav;
}

export const TocDecoration = Extension.create({
  name: "tocDecoration",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            let headings: HeadingRef[] | null = null;
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "paragraph") return;
              if (node.childCount !== 1) return;
              const text = node.firstChild;
              if (!text || !text.isText || text.text?.trim() !== "::toc") return;
              decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "toc-marker" }));
              headings ??= collectHeadings(state.doc);
              const captured = headings;
              decos.push(
                Decoration.widget(pos + node.nodeSize, (view) => buildTocWidget(view, captured), {
                  side: 1,
                  // 제목이 바뀌면 위젯을 새로 그린다 — key가 같으면 PM이 이전 DOM을 재사용한다
                  key: `toc:${captured.map((h) => `${h.level}:${h.text}`).join("|")}`,
                }),
              );
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
