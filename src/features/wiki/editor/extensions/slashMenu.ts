import { Extension, type Editor } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";

const slashMenuPluginKey = new PluginKey("slashMenu");

export interface SlashItem {
  id: string;
  label: string;
  run: (editor: Editor) => void;
}

/** 화이트리스트 11개 블록 — 순서가 곧 기본 노출 순서다 */
export const SLASH_ITEMS: SlashItem[] = [
  { id: "h1", label: "제목 1", run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { id: "h2", label: "제목 2", run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { id: "h3", label: "제목 3", run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { id: "bullet", label: "글머리 목록", run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: "ordered", label: "번호 목록", run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: "task", label: "체크박스 목록", run: (e) => e.chain().focus().toggleTaskList().run() },
  { id: "quote", label: "인용", run: (e) => e.chain().focus().toggleBlockquote().run() },
  // GitHub-style alerts — 저장 문법은 순수 blockquote(`> [!TYPE] `)뿐이라 신규 노드 타입이 필요 없다.
  // insertContent("> [!NOTE] ")는 TipTap에서 마크다운으로 재해석되지 않으므로
  // toggleBlockquote()로 blockquote를 먼저 만들고 그 안에 마커 텍스트만 삽입한다.
  // IMPORTANT는 문법(렌더)은 지원하되 슬래시 메뉴에는 노출하지 않는다(브리프 지시).
  {
    id: "note",
    label: "노트 패널",
    run: (e) => e.chain().focus().toggleBlockquote().insertContent("[!NOTE] ").run(),
  },
  {
    id: "tip",
    label: "팁 패널",
    run: (e) => e.chain().focus().toggleBlockquote().insertContent("[!TIP] ").run(),
  },
  {
    id: "warning",
    label: "경고 패널",
    run: (e) => e.chain().focus().toggleBlockquote().insertContent("[!WARNING] ").run(),
  },
  {
    id: "caution",
    label: "주의 패널",
    run: (e) => e.chain().focus().toggleBlockquote().insertContent("[!CAUTION] ").run(),
  },
  { id: "code", label: "코드 블록", run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { id: "divider", label: "구분선", run: (e) => e.chain().focus().setHorizontalRule().run() },
  {
    id: "table",
    label: "표",
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "image",
    label: "이미지 (URL)",
    run: (e) => {
      const src = window.prompt("이미지 URL을 입력하세요");
      if (src) e.chain().focus().setImage({ src }).run();
    },
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter((i) => i.label.toLowerCase().includes(q));
}

/**
 * 커서 앞 텍스트 기준으로 "아직 닫히지 않은 [[ 런"이 활성인지 판정 — wikiLinkSuggestion이
 * 반응하는 것과 동일한 패턴이다. `[[운영 /`처럼 [[ 쿼리(공백 허용) 안에 "/"가 오면 두 팝업이
 * 동시에 뜨는 것을 막기 위해 slashMenu의 allow에서 이 함수가 true면 활성화를 거부한다.
 */
export function isInsideOpenWikiLink(textBefore: string): boolean {
  return /\[\[[^[\]\n]*$/.test(textBefore);
}

export interface SlashMenuOptions {
  /**
   * 팝업 상태 브릿지 — null이면 닫힘. WikiEditor가 React 상태로 그린다.
   * command는 클릭 선택(onPick) 시 호출할 선택 커맨드 — onStart/onUpdate마다 최신 것으로 갱신된다.
   */
  onStateChange: (state: {
    items: SlashItem[];
    highlight: number;
    clientRect: DOMRect | null;
    command: (item: SlashItem) => void;
  } | null) => void;
}

export const SlashMenu = Extension.create<SlashMenuOptions>({
  name: "slashMenu",

  addOptions() {
    return { onStateChange: () => {} };
  },

  addProseMirrorPlugins() {
    const { onStateChange } = this.options;
    let items: SlashItem[] = [];
    let highlight = 0;
    let clientRect: (() => DOMRect | null) | null = null;
    let command: ((item: SlashItem) => void) | null = null;

    const emit = () =>
      onStateChange(
        items.length && command
          ? { items, highlight, clientRect: clientRect?.() ?? null, command }
          : null,
      );

    return [
      Suggestion({
        editor: this.editor,
        pluginKey: slashMenuPluginKey,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        allow: ({ state, range }) => {
          const textBefore = state.doc.textBetween(0, range.from, "\n", "\n");
          return !isInsideOpenWikiLink(textBefore);
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          (props as SlashItem).run(editor);
        },
        items: ({ query }) => filterSlashItems(query),
        render: () => ({
          onStart(props) {
            items = props.items as SlashItem[];
            highlight = 0;
            clientRect = props.clientRect ?? null;
            command = props.command as (item: SlashItem) => void;
            emit();
          },
          onUpdate(props) {
            items = props.items as SlashItem[];
            highlight = Math.min(highlight, Math.max(items.length - 1, 0));
            clientRect = props.clientRect ?? null;
            command = props.command as (item: SlashItem) => void;
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
