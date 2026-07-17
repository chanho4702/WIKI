import { useEffect, useReducer } from "react";
import type { Editor } from "@tiptap/core";
import { SLASH_ITEMS } from "../extensions/slashMenu";
import { promptSetLink } from "../lib/linkCommand";
import { InsertMenu } from "./InsertMenu";

/** 슬래시 메뉴 이미지 항목의 run을 그대로 재사용 — URL 프롬프트/삽입 로직을 이중 정의하지 않는다 */
const insertImage = SLASH_ITEMS.find((i) => i.id === "image")!.run;

const BLOCK_OPTIONS = [
  { value: "paragraph", label: "본문" },
  { value: "h1", label: "제목 1" },
  { value: "h2", label: "제목 2" },
  { value: "h3", label: "제목 3" },
] as const;

/** 컨플식 상단 고정 툴바 — 마크다운 표현 가능 컨트롤만. 정렬은 저장 포맷 제약으로 제외(로드맵 3단계) */
export function TopToolbar({ editor }: { editor: Editor }) {
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

  const btn = (label: string, text: string, onClick: () => void, active = false, disabled = false) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={active ? "is-active" : undefined}
      // 마우스다운에서 preventDefault — 클릭 시점에 에디터 선택 영역이 blur로 풀리지 않게 한다
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {text}
    </button>
  );

  return (
    <div className="top-toolbar" role="toolbar" aria-label="편집 도구">
      {btn("실행 취소", "↶", () => editor.chain().focus().undo().run(), false, !editor.can().undo())}
      {btn("다시 실행", "↷", () => editor.chain().focus().redo().run(), false, !editor.can().redo())}
      <span className="top-toolbar-divider" />
      <select aria-label="블록 타입" value={blockValue} onChange={(e) => setBlock(e.target.value)}>
        {BLOCK_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="top-toolbar-divider" />
      {btn("굵게", "B", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {btn("기울임", "I", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {btn("취소선", "S", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
      {btn("코드", "<>", () => editor.chain().focus().toggleCode().run(), editor.isActive("code"))}
      <span className="top-toolbar-divider" />
      {btn("글머리 목록", "•≡", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {btn("번호 목록", "1≡", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {btn("체크박스 목록", "☑", () => editor.chain().focus().toggleTaskList().run(), editor.isActive("taskList"))}
      <span className="top-toolbar-divider" />
      {btn("인용", "❝", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
      {btn("코드 블록", "{}", () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive("codeBlock"))}
      {btn("구분선", "—", () => editor.chain().focus().setHorizontalRule().run())}
      {btn("표", "⊞", () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      <span className="top-toolbar-divider" />
      {btn("링크", "🔗", () => promptSetLink(editor), editor.isActive("link"))}
      {btn("이미지", "🖼", () => insertImage(editor))}
      <span className="top-toolbar-divider" />
      <InsertMenu editor={editor} />
    </div>
  );
}
