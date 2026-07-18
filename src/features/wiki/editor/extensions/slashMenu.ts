import { Extension, type Editor } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";

const slashMenuPluginKey = new PluginKey("slashMenu");

export interface SlashItem {
  id: string;
  label: string;
  /** 요소 브라우저(InsertMenu)·슬래시 메뉴 팝업에 라벨 아래 한 줄로 노출하는 설명 */
  description: string;
  /**
   * 항목 선택이 일반 편집 명령이 아니라 UI를 열어야 하는 경우의 마커(W6 T4) — 현재는
   * "이모지" 항목만 해당한다. SlashItem.run은 editor만 받으므로 팝오버를 직접 열 수 없다.
   * action이 있으면 호출부(이 파일의 Suggestion command, InsertMenu.tsx의 select)가 run 대신
   * 등록된 오픈 콜백을 호출한다 — run은 그 경우 아무 것도 하지 않는 no-op으로 둔다.
   */
  action?: "openEmoji";
  run: (editor: Editor) => void;
}

/**
 * 노트/팁/경고/주의 패널 삽입 — blockquote로 감싼 뒤 마커 텍스트를 "현재 텍스트블록의 시작
 * 위치"에 삽입한다(W7 T2 — 줄 중간 가드). 이전엔 `insertContent(marker)`로 커서 위치에 바로
 * 삽입했는데, "안내: " 뒤에서 실행하면 "안내: [!NOTE] "처럼 마커가 줄 중간에 박혀
 * remarkAlerts의 `^[!TYPE]` 앵커(줄 시작 고정)에 걸리지 않고 조용히 무늬만 blockquote인
 * 텍스트가 됐다.
 *
 * `.command(({ tr, state }) => ...)`는 체인의 다른 명령들과 같은 트랜잭션(tr)을 공유하므로
 * `state.selection`은 toggleBlockquote가 반영된(매핑된) 이후 상태를 가리킨다 — 즉 여기서 읽는
 * `$from.start()`는 wrap 이후의 블록 시작 위치다. 하나의 트랜잭션으로 처리되므로 실행 취소도
 * 한 번에 묶인다.
 */
function insertAlertMarker(editor: Editor, marker: string): void {
  editor
    .chain()
    .focus()
    .toggleBlockquote()
    .command(({ tr, state }) => {
      tr.insertText(marker, state.selection.$from.start());
      return true;
    })
    .run();
}

/** 화이트리스트 15개 블록 — 순서가 곧 기본 노출 순서다 */
export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "h1",
    label: "제목 1",
    description: "큰 섹션 제목을 추가합니다",
    run: (e) => e.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "제목 2",
    description: "중간 섹션 제목을 추가합니다",
    run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "제목 3",
    description: "작은 섹션 제목을 추가합니다",
    run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "글머리 목록",
    description: "글머리 기호로 목록을 만듭니다",
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ordered",
    label: "번호 목록",
    description: "번호를 매겨 목록을 만듭니다",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "task",
    label: "체크박스 목록",
    description: "체크박스가 있는 할 일 목록을 만듭니다",
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: "quote",
    label: "인용",
    description: "인용구 블록을 추가합니다",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  // GitHub-style alerts — 저장 문법은 순수 blockquote(`> [!TYPE] `)뿐이라 신규 노드 타입이 필요 없다.
  // insertContent("> [!NOTE] ")는 TipTap에서 마크다운으로 재해석되지 않으므로
  // toggleBlockquote()로 blockquote를 먼저 만들고 그 안에 마커 텍스트만 삽입한다.
  // IMPORTANT는 문법(렌더)은 지원하되 슬래시 메뉴에는 노출하지 않는다(브리프 지시).
  {
    id: "note",
    label: "노트 패널",
    description: "파란색 정보 패널을 추가합니다",
    run: (e) => insertAlertMarker(e, "[!NOTE] "),
  },
  {
    id: "tip",
    label: "팁 패널",
    description: "초록색 팁 패널을 추가합니다",
    run: (e) => insertAlertMarker(e, "[!TIP] "),
  },
  {
    id: "warning",
    label: "경고 패널",
    description: "노란색 경고 패널을 추가합니다",
    run: (e) => insertAlertMarker(e, "[!WARNING] "),
  },
  {
    id: "caution",
    label: "주의 패널",
    description: "빨간색 주의 패널을 추가합니다",
    run: (e) => insertAlertMarker(e, "[!CAUTION] "),
  },
  {
    id: "code",
    label: "코드 블록",
    description: "구문 강조가 있는 코드 블록을 추가합니다",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "divider",
    label: "구분선",
    description: "가로 구분선을 추가합니다",
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "table",
    label: "표",
    description: "행과 열로 콘텐츠를 구성합니다",
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "image",
    label: "이미지 (URL)",
    description: "URL로 이미지를 삽입합니다",
    run: (e) => {
      const src = window.prompt("이미지 URL을 입력하세요");
      if (src) e.chain().focus().setImage({ src }).run();
    },
  },
  {
    id: "emoji",
    label: "이모지",
    description: "이모지를 삽입합니다",
    // run은 no-op — 실제로는 action 마커를 보고 호출부가 EmojiPicker 팝오버를 연다.
    action: "openEmoji",
    run: () => {},
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter((i) => i.label.toLowerCase().includes(q));
}

/**
 * InsertMenu(요소 브라우저) 전용 필터 — 라벨뿐 아니라 설명(description)도 부분 일치로 검색한다.
 * 슬래시 메뉴(에디터 안 "/" 트리거)는 filterSlashItems(라벨 전용)를 그대로 쓴다 — "/"로 빠르게
 * 타이핑하는 흐름에서 설명 텍스트까지 매치되면 의도치 않은 항목이 섞여 들어올 수 있어서다.
 * InsertMenu는 마우스로 찾아보는 브라우징 UI라 설명 검색이 오히려 발견성을 높인다.
 */
export function filterInsertMenuItems(query: string): SlashItem[] {
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter(
    (i) => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
  );
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
  /** action: "openEmoji" 항목이 선택됐을 때 호출 — WikiEditor가 EmojiPicker의 open 상태를 연다 */
  onOpenEmoji: () => void;
}

export const SlashMenu = Extension.create<SlashMenuOptions>({
  name: "slashMenu",

  addOptions() {
    return { onStateChange: () => {}, onOpenEmoji: () => {} };
  },

  addProseMirrorPlugins() {
    const { onStateChange, onOpenEmoji } = this.options;
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
          const item = props as SlashItem;
          if (item.action === "openEmoji") {
            onOpenEmoji();
            return;
          }
          item.run(editor);
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
