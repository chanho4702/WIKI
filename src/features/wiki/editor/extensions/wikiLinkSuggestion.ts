import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import type { Page } from "../../store/types";

const MAX_SUGGESTIONS = 8;

/** [[제목]] 문법이 표현할 수 없는 제목([, ], 개행)은 후보 제외 — WikiLinkTextArea 규칙 이식 */
export function filterLinkCandidates(pages: Page[], query: string): Page[] {
  const q = query.toLowerCase();
  return pages
    .filter((p) => !/[[\]\n]/.test(p.title))
    .filter((p) => p.title.toLowerCase().includes(q))
    .slice(0, MAX_SUGGESTIONS);
}

export interface WikiLinkSuggestionOptions {
  getPages: () => Page[];
  /**
   * 팝업 상태 브릿지 — null이면 닫힘. WikiEditor가 React 상태로 그린다.
   * command는 클릭 선택(onPick) 시 호출할 선택 커맨드 — onStart/onUpdate마다 최신 것으로 갱신된다.
   */
  onStateChange: (state: {
    items: Page[];
    highlight: number;
    clientRect: DOMRect | null;
    command: (item: Page) => void;
  } | null) => void;
}

export const WikiLinkSuggestion = Extension.create<WikiLinkSuggestionOptions>({
  name: "wikiLinkSuggestion",

  addOptions() {
    return { getPages: () => [], onStateChange: () => {} };
  },

  addProseMirrorPlugins() {
    const { getPages, onStateChange } = this.options;
    let items: Page[] = [];
    let highlight = 0;
    let clientRect: (() => DOMRect | null) | null = null;
    let command: ((item: Page) => void) | null = null;

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
            .insertContentAt(range, [{ type: "wikiLink", attrs: { title: (props as Page).title } }])
            .run();
        },
        items: ({ query }) => filterLinkCandidates(getPages(), query),
        render: () => ({
          onStart(props) {
            items = props.items as Page[];
            highlight = 0;
            clientRect = props.clientRect ?? null;
            command = props.command as (item: Page) => void;
            emit();
          },
          onUpdate(props) {
            items = props.items as Page[];
            highlight = Math.min(highlight, Math.max(items.length - 1, 0));
            clientRect = props.clientRect ?? null;
            command = props.command as (item: Page) => void;
            emit();
          },
          onKeyDown(props) {
            if (props.event.key === "Escape") {
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
            items = [];
            emit();
          },
        }),
      }),
    ];
  },
});
