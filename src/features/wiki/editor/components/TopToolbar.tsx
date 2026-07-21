import { useEffect, useReducer, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  SquareCode,
  Minus,
  Table,
  Link,
  Image,
} from "lucide-react";
import { SLASH_ITEMS } from "../extensions/slashMenu";
import { promptSetLink } from "../lib/linkCommand";
import { useControlledOpenState } from "../../lib/controlledOpenState";
import { InsertMenu } from "./InsertMenu";
import { EmojiPicker } from "./EmojiPicker";

/** 슬래시 메뉴 이미지 항목의 run을 그대로 재사용 — URL 프롬프트/삽입 로직을 이중 정의하지 않는다 */
const insertImage = SLASH_ITEMS.find((i) => i.id === "image")!.run;

const BLOCK_OPTIONS = [
  { value: "paragraph", label: "본문" },
  { value: "h1", label: "제목 1" },
  { value: "h2", label: "제목 2" },
  { value: "h3", label: "제목 3" },
] as const;

export interface TopToolbarProps {
  editor: Editor;
  /**
   * 이모지 피커(W6 T4) 열림 상태를 WikiEditor가 제어할 때 지정한다 — 슬래시 메뉴 "이모지" 항목이
   * 이 팝오버를 열어야 하는데, 슬래시 메뉴 확장은 TopToolbar보다 먼저(useEditor 안에서) 구성되므로
   * 상태를 WikiEditor로 끌어올려야 두 진입점(이 버튼, 슬래시 메뉴)이 같은 팝오버를 공유한다.
   * 미지정 시(예: 이 컴포넌트 단독 테스트) EmojiPicker가 자체 내부 상태로 대체한다.
   */
  emojiPickerOpen?: boolean;
  onEmojiPickerOpenChange?: (open: boolean) => void;
}

/** 컨플식 상단 고정 툴바 — 마크다운 표현 가능 컨트롤만. 정렬은 저장 포맷 제약으로 제외(로드맵 3단계) */
export function TopToolbar({ editor, emojiPickerOpen, onEmojiPickerOpenChange }: TopToolbarProps) {
  // emojiPickerOpen/onEmojiPickerOpenChange 쌍 판정(W7 T2) — 둘 다 있으면 controlled, 둘 다 없으면
  // 내부 state, 한쪽만 있으면 dev 경고 + 내부 state 폴백. 이렇게 정규화한 [open, setOpen]을
  // EmojiPicker에 항상 "완전한 쌍"으로 넘기므로, EmojiPicker 자신은 반쪽 프롭을 볼 일이 없다 —
  // InsertMenu의 onOpenEmoji도 이 setOpen 하나로 통일한다(이전엔 `onEmojiPickerOpenChange?.(true)`로
  // 옵셔널 체이닝했는데, 그러면 onEmojiPickerOpenChange 없이 emojiPickerOpen만 온 반쪽 배선에서
  // 이모지 항목 클릭이 조용히 아무 일도 안 했다).
  const [emojiOpen, setEmojiOpen] = useControlledOpenState("TopToolbar", emojiPickerOpen, onEmojiPickerOpenChange);

  // 셀렉션/문서 변경 시 활성 상태 갱신 — transaction 구독
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    editor.on("transaction", force);
    return () => {
      editor.off("transaction", force);
    };
  }, [editor]);

  const blockValue = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "paragraph";

  const setBlock = (value: string) => {
    const chain = editor.chain().focus();
    if (value === "paragraph") chain.setParagraph().run();
    else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
  };

  // 아이콘 버튼 — 접근 가능한 이름은 aria-label(한국어)로 고정하고, 렌더되는 lucide 아이콘은
  // aria-hidden으로 접근성 트리에서 뺀다(이름 계산에 아이콘 SVG가 섞이지 않게). title은 마우스
  // 호버 시 네이티브 툴팁으로 aria-label과 동일 문구를 보여준다.
  const btn = (label: string, icon: ReactNode, onClick: () => void, active = false, disabled = false) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={active ? "is-active" : undefined}
      // 마우스다운에서 preventDefault — 클릭 시점에 에디터 선택 영역이 blur로 풀리지 않게 한다
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {icon}
    </button>
  );

  return (
    <div className="top-toolbar" role="toolbar" aria-label="편집 도구">
      {btn("실행 취소", <Undo2 size={16} aria-hidden />, () => editor.chain().focus().undo().run(), false, !editor.can().undo())}
      {btn("다시 실행", <Redo2 size={16} aria-hidden />, () => editor.chain().focus().redo().run(), false, !editor.can().redo())}
      <span className="top-toolbar-divider" />
      <select aria-label="블록 타입" value={blockValue} onChange={(e) => setBlock(e.target.value)}>
        {BLOCK_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="top-toolbar-divider" />
      {btn("굵게", <Bold size={16} aria-hidden />, () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {btn("기울임", <Italic size={16} aria-hidden />, () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {btn("취소선", <Strikethrough size={16} aria-hidden />, () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
      {btn("코드", <Code size={16} aria-hidden />, () => editor.chain().focus().toggleCode().run(), editor.isActive("code"))}
      <span className="top-toolbar-divider" />
      {btn("글머리 목록", <List size={16} aria-hidden />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {btn("번호 목록", <ListOrdered size={16} aria-hidden />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {btn("체크박스 목록", <ListChecks size={16} aria-hidden />, () => editor.chain().focus().toggleTaskList().run(), editor.isActive("taskList"))}
      <span className="top-toolbar-divider" />
      {btn("인용", <Quote size={16} aria-hidden />, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
      {btn("코드 블록", <SquareCode size={16} aria-hidden />, () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive("codeBlock"))}
      {btn("구분선", <Minus size={16} aria-hidden />, () => editor.chain().focus().setHorizontalRule().run())}
      {btn("표", <Table size={16} aria-hidden />, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      <span className="top-toolbar-divider" />
      {btn("링크", <Link size={16} aria-hidden />, () => promptSetLink(editor), editor.isActive("link"))}
      {btn("이미지", <Image size={16} aria-hidden />, () => insertImage(editor))}
      <span className="top-toolbar-divider" />
      <EmojiPicker editor={editor} open={emojiOpen} onOpenChange={setEmojiOpen} />
      <InsertMenu editor={editor} onOpenEmoji={() => setEmojiOpen(true)} />
    </div>
  );
}
