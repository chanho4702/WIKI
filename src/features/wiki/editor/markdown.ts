import { Editor, type JSONContent } from "@tiptap/core";
import { buildBaseExtensions } from "./extensions/base";
import { WIKI_LINK_SOURCE } from "../lib/wikiLinks";

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

/** 코드 계열은 승격 제외 */
const SKIP_TYPES = new Set(["codeBlock"]);

function promoteInline(nodes: JSONContent[]): JSONContent[] {
  return nodes.flatMap((node) => {
    if (node.type !== "text" || !node.text) return [node];
    if (node.marks?.some((m) => m.type === "code")) return [node]; // 인라인 코드 제외
    const wikiLinkRegex = new RegExp(WIKI_LINK_SOURCE, "g");
    const parts: JSONContent[] = [];
    let last = 0;
    for (const match of node.text.matchAll(wikiLinkRegex)) {
      const index = match.index ?? 0;
      if (index > last) parts.push({ ...node, text: node.text.slice(last, index) });
      // 원본 텍스트의 마크(굵게 등)를 승격된 wikiLink 노드에도 유지한다 — 없으면 필드 생략
      parts.push({ type: "wikiLink", attrs: { title: match[1] }, ...(node.marks ? { marks: node.marks } : {}) });
      last = index + match[0].length;
    }
    if (parts.length === 0) return [node];
    if (last < node.text.length) parts.push({ ...node, text: node.text.slice(last) });
    return parts;
  });
}

function promoteWikiLinks(node: JSONContent): JSONContent {
  if (SKIP_TYPES.has(node.type ?? "")) return node;
  if (!node.content) return node;
  const walked = node.content.map(promoteWikiLinks);
  return { ...node, content: promoteInline(walked) };
}

/** 마크다운 → TipTap 문서 JSON. 실패 시 호출부에서 폴백 처리한다(throw 전파). */
export function parseMarkdown(md: string): JSONContent {
  const doc = withEditor(md, (editor) => editor.getJSON());
  return promoteWikiLinks(doc);
}

/** TipTap 문서 JSON → 마크다운 */
export function serializeMarkdown(doc: JSONContent): string {
  return withEditor(doc, (editor) => editor.storage.markdown.getMarkdown());
}
