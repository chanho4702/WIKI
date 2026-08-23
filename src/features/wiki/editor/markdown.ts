import { Editor, type JSONContent } from "@tiptap/core";
import { buildBaseExtensions } from "./extensions/base";
import { WIKI_LINK_SOURCE } from "../lib/wikiLinks";
import { USER_MENTION_NAME, mentionUserIdFromHref } from "./extensions/userMention";

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
    // `[@이름](user:1)` — 표준 링크로 파싱된 멘션을 원자 노드로 승격한다(userMention.ts 문법 근거)
    const linkMark = node.marks?.find((m) => m.type === "link");
    const mentionUserId = mentionUserIdFromHref(
      (linkMark?.attrs as { href?: string } | undefined)?.href,
    );
    if (mentionUserId !== null) {
      const rest = node.marks?.filter((m) => m.type !== "link");
      return [{
        type: USER_MENTION_NAME,
        attrs: { userId: mentionUserId, name: node.text.replace(/^@/, "") },
        ...(rest && rest.length ? { marks: rest } : {}),
      }];
    }
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

/** 파싱 실패 시 원문 전체를 플레인 문단으로 보존해 편집 진입을 막지 않는다. */
export function safeParse(md: string): JSONContent {
  try {
    return parseMarkdown(md);
  } catch (error) {
    console.warn("마크다운 파싱 실패 — 플레인 텍스트로 로드합니다", error);
    return {
      type: "doc",
      content: md.split(/\n{2,}/).map((paragraph) => ({
        type: "paragraph",
        content: paragraph ? [{ type: "text", text: paragraph }] : [],
      })),
    };
  }
}

/** TipTap 문서 JSON → 마크다운 */
export function serializeMarkdown(doc: JSONContent): string {
  return withEditor(doc, (editor) => editor.storage.markdown.getMarkdown());
}
