import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import type { WikiLinkTarget } from "../../lib/wikiLinks";

const MAX_SUGGESTIONS = 8;

/** [[제목]] 문법이 표현할 수 없는 제목([, ], 개행)은 후보 제외 — WikiLinkTextArea 규칙 이식 */
export function filterLinkCandidates(pages: WikiLinkTarget[], query: string): WikiLinkTarget[] {
  const q = query.toLowerCase();
  return pages
    .filter((p) => !/[[\]\n]/.test(p.title))
    .filter((p) => p.title.toLowerCase().includes(q))
    .slice(0, MAX_SUGGESTIONS);
}

export interface WikiLinkSuggestionOptions {
  getPages: () => WikiLinkTarget[];
  /**
   * 입력 중인 검색어 — 호출부가 서버에서 후보를 받아오는 훅(2026-08-28).
   * getPages는 동기라 스페이스 전량을 들고 있어야 했는데, 이제 호출부가 이 콜백으로
   * 비동기 조회를 걸고 결과를 getPages 캐시에 넣는다.
   */
  onQuery?: (query: string) => void;
  /**
   * 비동기 후보가 도착했을 때 호출부가 부를 수 있는 갱신 함수를 넘겨받는다.
   * 플러그인 내부의 items는 tiptap이 호출한 시점의 결과라, 나중에 온 조회 결과를 반영하려면
   * 마지막 검색어로 다시 계산해야 한다 — 그러지 않으면 Enter·화살표가 빈 목록 위에서 돈다.
   */
  registerRefresh?: (refresh: () => void) => void;
  /**
   * 팝업 상태 브릿지 — null이면 닫힘. WikiEditor가 React 상태로 그린다.
   * command는 클릭 선택(onPick) 시 호출할 선택 커맨드 — onStart/onUpdate마다 최신 것으로 갱신된다.
   */
  onStateChange: (state: {
    items: WikiLinkTarget[];
    highlight: number;
    clientRect: DOMRect | null;
    command: (item: WikiLinkTarget) => void;
  } | null) => void;
}

export const WikiLinkSuggestion = Extension.create<WikiLinkSuggestionOptions>({
  name: "wikiLinkSuggestion",

  addOptions() {
    return {
      getPages: () => [],
      onStateChange: () => {},
      onQuery: () => {},
      registerRefresh: () => {},
    };
  },

  addProseMirrorPlugins() {
    const { getPages, onStateChange, onQuery, registerRefresh } = this.options;
    let items: WikiLinkTarget[] = [];
    let highlight = 0;
    let clientRect: (() => DOMRect | null) | null = null;
    let command: ((item: WikiLinkTarget) => void) | null = null;
    let lastQuery = "";
    let active = false;

    // 조회 결과가 늦게 와도 열려 있는 팝업이 그 자리에서 채워지도록 마지막 검색어로 다시 계산한다.
    registerRefresh?.(() => {
      if (!active) return;
      items = filterLinkCandidates(getPages(), lastQuery);
      highlight = Math.min(highlight, Math.max(items.length - 1, 0));
      emit();
    });

    const emit = () =>
      onStateChange(
        items.length && command
          ? { items, highlight, clientRect: clientRect?.() ?? null, command }
          : null,
      );

    return [
      Suggestion({
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        startOfLine: false,
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [{ type: "wikiLink", attrs: { title: (props as WikiLinkTarget).title } }])
            .run();
        },
        items: ({ query }) => {
          lastQuery = query;
          onQuery?.(query); // 비동기 조회 트리거 — 결과는 registerRefresh로 반영된다
          return filterLinkCandidates(getPages(), query);
        },
        render: () => ({
          onStart(props) {
            active = true;
            // props.items는 tiptap이 items()를 부른 시점의 결과다. 비동기 조회가 그 사이에
            // 끝났을 수도 있어(실측: 목업 스토어에서 먼저 도착) 항상 캐시로 다시 계산한다.
            items = filterLinkCandidates(getPages(), lastQuery);
            highlight = 0;
            clientRect = props.clientRect ?? null;
            command = props.command as (item: WikiLinkTarget) => void;
            emit();
          },
          onUpdate(props) {
            active = true;
            items = filterLinkCandidates(getPages(), lastQuery);
            highlight = Math.min(highlight, Math.max(items.length - 1, 0));
            clientRect = props.clientRect ?? null;
            command = props.command as (item: WikiLinkTarget) => void;
            emit();
          },
          onKeyDown(props) {
            if (props.event.key === "Escape") {
              active = false;
              items = [];
              emit();
              return true;
            }
            if (props.event.key === "ArrowDown") {
              if (items.length === 0) return false;
              highlight = (highlight + 1) % items.length;
              emit();
              return true;
            }
            if (props.event.key === "ArrowUp") {
              if (items.length === 0) return false;
              highlight = (highlight - 1 + items.length) % items.length;
              emit();
              return true;
            }
            if (props.event.key === "Enter" && items.length && command) {
              command(items[highlight]);
              return true;
            }
            return false;
          },
          onExit() {
            active = false;
            items = [];
            emit();
          },
        }),
      }),
    ];
  },
});
