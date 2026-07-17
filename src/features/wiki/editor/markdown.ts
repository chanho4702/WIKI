import { Editor, type JSONContent } from "@tiptap/core";
import { buildBaseExtensions } from "./extensions/base";

/** 변환 전용 헤드리스 에디터 — 사용 후 반드시 destroy */
function withEditor<T>(content: string | JSONContent, fn: (editor: Editor) => T): T {
  const editor = new Editor({
    extensions: buildBaseExtensions(),
    content,
  });
  try {
    return fn(editor);
  } finally {
    editor.destroy();
  }
}

/** 마크다운 → TipTap 문서 JSON. 실패 시 호출부에서 폴백 처리한다(throw 전파). */
export function parseMarkdown(md: string): JSONContent {
  return withEditor(md, (editor) => editor.getJSON());
}

/** TipTap 문서 JSON → 마크다운 */
export function serializeMarkdown(doc: JSONContent): string {
  return withEditor(doc, (editor) => editor.storage.markdown.getMarkdown());
}
