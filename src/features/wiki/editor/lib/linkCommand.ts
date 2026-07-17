import type { Editor } from "@tiptap/core";

/**
 * 링크 설정/해제 공용 커맨드 — BubbleToolbar(선택 시 플로팅 툴바)와 TopToolbar(상단 고정 툴바)
 * 양쪽에서 동일한 로직을 쓴다. prompt로 URL을 물어 빈 문자열이면 링크를 해제하고,
 * 취소(null)면 아무 것도 하지 않는다.
 */
export function promptSetLink(editor: Editor): void {
  const url = window.prompt("링크 URL을 입력하세요", editor.getAttributes("link").href ?? "");
  if (url === null) return;
  if (url === "") {
    editor.chain().focus().unsetLink().run();
  } else {
    editor.chain().focus().setLink({ href: url }).run();
  }
}
