import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { DATE_MENTION_NAME } from "./dateMention";

/**
 * `//` 날짜 삽입 트리거 — Confluence 에디터의 `//` 캘린더와 같은 구조.
 * 팝업(캘린더) 렌더는 WikiEditor가 DatePickerPopup으로 그린다(wikiLink/멘션 서제스천 패턴).
 * 목록형 서제스천과 달리 항목이 없다 — clientRect·명령만 브릿지한다.
 */
export interface DateSuggestionOptions {
  onStateChange: (state: {
    clientRect: DOMRect | null;
    /** 선택한 ISO 날짜(YYYY-MM-DD)를 문서에 삽입한다 */
    command: (isoDate: string) => void;
  } | null) => void;
}

export const DateSuggestion = Extension.create<DateSuggestionOptions>({
  name: "dateSuggestion",

  addOptions() {
    return { onStateChange: () => {} };
  },

  addProseMirrorPlugins() {
    const { onStateChange } = this.options;
    let clientRect: (() => DOMRect | null) | null = null;
    let command: ((isoDate: string) => void) | null = null;
    let open = false;

    const emit = () =>
      onStateChange(open && command ? { clientRect: clientRect?.() ?? null, command } : null);

    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey("dateSuggestion"),
        char: "//",
        allowSpaces: false,
        startOfLine: false,
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: DATE_MENTION_NAME, attrs: { date: props as string } },
              { type: "text", text: " " },
            ])
            .run();
        },
        // 캘린더는 항목 목록이 아니다 — Suggestion을 활성 상태로 유지하기 위한 형식적 단일 항목
        items: () => ["calendar"],
        render: () => ({
          onStart(props) {
            open = true;
            clientRect = props.clientRect ?? null;
            command = (isoDate) => props.command(isoDate);
            emit();
          },
          onUpdate(props) {
            clientRect = props.clientRect ?? null;
            command = (isoDate) => props.command(isoDate);
            emit();
          },
          onKeyDown(props) {
            if (props.event.key === "Escape") {
              open = false;
              emit();
              return true;
            }
            // Enter = 오늘 날짜 즉시 삽입(키보드 경로 — 캘린더는 마우스 없이도 쓸 수 있어야 한다)
            if (props.event.key === "Enter" && command) {
              const now = new Date();
              const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
              command(iso);
              return true;
            }
            return false;
          },
          onExit() {
            open = false;
            emit();
          },
        }),
      }),
    ];
  },
});
