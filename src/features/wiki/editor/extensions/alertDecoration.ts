import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

/**
 * GitHub-style Alerts(Task 14) 라이브 프리뷰 — 뷰의 remarkAlerts.ts와 같은 마커 규약이지만,
 * 여기서는 마커 텍스트를 지우지 않고(왕복 안전) 데코레이션만 얹는다.
 *
 * 컨플루언스식 표시(2026-08-23): 원본 마커(`[!NOTE]`)는 CSS로 숨기고 그 자리에 타입 아이콘
 * 위젯을 그린다 — 보기 화면(MarkdownView의 ALERT_ICONS)과 같은 lucide 아이콘 세트다.
 * 커서가 패널 안에 있을 때는 우상단에 5종 전환 스위처를 띄워 마커 텍스트를 치환한다.
 * 마커는 문서에 그대로 남으므로 저장 문법·왕복은 불변이고, 패널 맨 앞에서 백스페이스로
 * 숨은 마커를 지우면 일반 인용구로 돌아간다(자연스러운 해제 경로).
 *
 * 색은 타입에 고정 매핑이다(NOTE=파랑 … CAUTION=빨강) — 마커가 곧 의미+색이라, 색만 따로
 * 바꾸려면 저장 문법 확장이 필요해 범위 밖으로 남긴다(아이콘·색 = 5종 중 선택).
 *
 * 실측(2026-07-17): parseMarkdown()은 입력이 "> [!NOTE] 내용"이든 이스케이프된
 * "> \[!NOTE\] 내용"이든 항상 이스케이프 없는 리터럴 텍스트 "[!NOTE] 내용"을 노드에 담는다
 * (백슬래시 이스케이프는 직렬화 단계에서만 생기고, 파싱 시 항상 해제된다). 에디터에서
 * 직접 타이핑할 때도 리터럴 문자만 쌓인다 — 이스케이프 형태를 별도 매칭할 필요가 없다.
 */
const ALERT_MARKER_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/;

/** 타입 메타 — 아이콘 SVG는 보기 화면 ALERT_ICONS(lucide Info/CircleCheck/StickyNote/
 * TriangleAlert/OctagonAlert)와 같은 도형을 정적 문자열로 옮긴 것이다(위젯은 React 밖 DOM). */
export const ALERT_TYPES: Array<{ marker: string; type: string; label: string; svg: string }> = [
  {
    marker: "NOTE",
    type: "note",
    label: "정보",
    svg: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  },
  {
    marker: "TIP",
    type: "tip",
    label: "성공",
    svg: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  },
  {
    marker: "IMPORTANT",
    type: "important",
    label: "노트",
    svg: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5-5V5a2 2 0 0 0-2-2Z"/><path d="M15 21v-5a2 2 0 0 1 2-2h5"/>',
  },
  {
    marker: "WARNING",
    type: "warning",
    label: "경고",
    svg: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  },
  {
    marker: "CAUTION",
    type: "caution",
    label: "주의",
    svg: '<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>',
  },
];

function svgIcon(svg: string): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("width", "16");
  el.setAttribute("height", "16");
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", "currentColor");
  el.setAttribute("stroke-width", "2");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = svg; // 정적 상수만 — 사용자 입력이 섞이는 경로 없음
  return el;
}

/** 마커 자리에 그리는 타입 아이콘 위젯. */
function iconWidget(type: (typeof ALERT_TYPES)[number]): HTMLElement {
  const span = document.createElement("span");
  span.className = "md-alert-icon-widget";
  span.contentEditable = "false";
  span.appendChild(svgIcon(type.svg));
  return span;
}

/** 패널 우상단 타입 스위처 — 클릭이 마커 텍스트(`[!NOTE]`)를 치환한다. */
function switcherWidget(
  view: EditorView,
  current: string,
  markerFrom: number,
  markerLen: number,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "md-alert-switcher";
  wrap.contentEditable = "false";
  wrap.setAttribute("role", "toolbar");
  wrap.setAttribute("aria-label", "패널 종류");
  for (const entry of ALERT_TYPES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "md-alert-switch";
    btn.setAttribute("aria-label", `${entry.label} 패널로 전환`);
    btn.setAttribute("aria-pressed", entry.type === current ? "true" : "false");
    btn.appendChild(svgIcon(entry.svg));
    // mousedown에서 처리 + preventDefault — 에디터 선택이 blur로 풀리지 않게(팝오버 규약)
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (entry.type === current) return;
      view.dispatch(view.state.tr.insertText(`[!${entry.marker}]`, markerFrom, markerFrom + markerLen));
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

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

              const type = ALERT_TYPES.find((t) => t.marker === match[1]);
              if (!type) return;
              decos.push(
                Decoration.node(pos, pos + node.nodeSize, { class: `md-alert md-alert-${type.type}` }),
              );

              // 마커 텍스트 시작 위치 = blockquote 진입(+1) + paragraph 진입(+1)
              const markerFrom = pos + 2;
              const markerLen = match[0].length;
              // 마커는 숨기고(md-alert-marker: display none) 그 자리에 아이콘 위젯을 그린다
              decos.push(Decoration.inline(markerFrom, markerFrom + markerLen, { class: "md-alert-marker" }));
              decos.push(
                Decoration.widget(markerFrom, () => iconWidget(type), {
                  side: -1,
                  key: `alert-icon-${type.type}`,
                }),
              );

              // 커서가 패널 안일 때만 타입 스위처 노출 — 위치 인자는 렌더 시점 값이고,
              // 문서가 바뀌면 decorations가 재계산되므로 클릭 시점에도 항상 최신이다
              const { from } = state.selection;
              if (from > pos && from < pos + node.nodeSize) {
                decos.push(
                  Decoration.widget(
                    markerFrom,
                    (view) => switcherWidget(view, type.type, markerFrom, markerLen),
                    { side: -2, key: `alert-switcher-${type.type}-${markerFrom}` },
                  ),
                );
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
