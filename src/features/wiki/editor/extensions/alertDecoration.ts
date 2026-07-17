import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * GitHub-style Alerts(Task 14) 라이브 프리뷰 — 뷰의 remarkAlerts.ts와 같은 마커 규약이지만,
 * 여기서는 마커 텍스트를 지우지 않고(편집 가능해야 하므로) 배지 데코레이션만 덧씌운다.
 *
 * 실측(2026-07-17): parseMarkdown()은 입력이 "> [!NOTE] 내용"이든 이스케이프된
 * "> \[!NOTE\] 내용"이든 항상 이스케이프 없는 리터럴 텍스트 "[!NOTE] 내용"을 노드에 담는다
 * (백슬래시 이스케이프는 직렬화 단계에서만 생기고, 파싱 시 항상 해제된다 — markdown.test.ts의
 * "GitHub-style alert(NOTE)" 케이스로 확인). 에디터에서 사용자가 직접 타이핑할 때도 마찬가지로
 * 리터럴 문자만 쌓인다 — ProseMirror 문서 텍스트에 백슬래시가 실제로 남는 경로는 없다.
 * 따라서 이스케이프 형태(\[!NOTE\])를 별도로 매칭할 필요가 없다.
 */
const ALERT_MARKER_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/;

export const AlertDecoration = Extension.create({
  name: "alertDecoration",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "blockquote") return;

              const firstParagraph = node.firstChild;
              if (!firstParagraph || firstParagraph.type.name !== "paragraph") return;

              const firstText = firstParagraph.firstChild;
              if (!firstText || !firstText.isText || !firstText.text) return;

              const match = ALERT_MARKER_RE.exec(firstText.text);
              if (!match) return;

              const type = match[1].toLowerCase();
              decos.push(Decoration.node(pos, pos + node.nodeSize, { class: `md-alert md-alert-${type}` }));

              // 마커 텍스트 시작 위치 = blockquote 진입(+1) + paragraph 진입(+1)
              const markerFrom = pos + 2;
              const markerTo = markerFrom + match[0].length;
              decos.push(Decoration.inline(markerFrom, markerTo, { class: "md-alert-marker" }));
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
