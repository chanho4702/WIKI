import type { Paragraph, Root, Text } from "mdast";
import { visit } from "unist-util-visit";

/**
 * 콘텐츠 매크로(W27-3) — 컨플루언스 Content by Label / Recently Updated.
 *
 * ## 저장 포맷
 *
 * remark-directive의 **리프 지시자** 한 줄이다 — `::toc`·`::excerpt-include[제목]`와 같은
 * 문법 가족이라 `Page.body`는 계속 마크다운 문자열이다(CLAUDE.md 불변조건 2).
 *
 * - `::pages-by-label[라벨]`      → `div.md-pages-by-label[data-label]`
 * - `::recently-updated{limit=5}` → `div.md-recently-updated[data-limit]`
 *
 * 자리표시 div만 만들고 실제 조회·렌더는 MarkdownView의 div 렌더러가 붙이는 컴포넌트가 한다 —
 * 스토어 접근이 remark 플러그인(동기 변환)에 들어가면 안 되기 때문이다.
 *
 * ## 왜 텍스트 폴백까지 보는가
 *
 * 편집기(markdown-it)는 이 지시자를 모른다 — 텍스트 문단으로 남고, 직렬화기가 대괄호를
 * `\[`·`\]`로(경우에 따라 콜론까지 `\:`로) 이스케이프한다. 지시자 파서가 그 형태를 못 읽으므로
 * `::toc`와 같이 텍스트 문단 형태도 함께 인식해 같은 결과로 맞춘다.
 */

/** 최근 업데이트 기본 건수 — 컨플루언스 Recently Updated와 같다. */
export const RECENTLY_UPDATED_DEFAULT = 5;
/** 최근 업데이트 상한 — 그보다 많으면 문서 안 목록이 아니라 스페이스 개요가 맞다. */
export const RECENTLY_UPDATED_MAX = 20;

const PAGES_BY_LABEL_TEXT_RE = /^\\?:\\?:pages-by-label\\?\[([^\]\\]*)\\?\]\s*$/;
const RECENTLY_UPDATED_TEXT_RE = /^\\?:\\?:recently-updated(?:\{([^}]*)\})?\s*$/;

/** `limit=7` 같은 지시자 속성 문자열에서 건수를 읽어 1..20으로 자른다. */
export function parseRecentlyUpdatedLimit(raw: string | undefined | null): number {
  const value = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(value)) return RECENTLY_UPDATED_DEFAULT;
  return Math.min(Math.max(value, 1), RECENTLY_UPDATED_MAX);
}

function limitFromAttrText(attrs: string | undefined): string | undefined {
  return /(?:^|\s)limit\s*=\s*"?([^\s"}]+)"?/.exec(attrs ?? "")?.[1];
}

/** 리프 지시자의 라벨(`[…]`)은 자식 인라인으로 들어온다 — 텍스트만 모은다(remarkExcerpt와 동일). */
function labelOf(children: Array<{ type: string; value?: string }> | undefined): string {
  return (children ?? [])
    .map((c) => (c.type === "text" ? (c.value ?? "") : ""))
    .join("")
    .trim();
}

function asPagesByLabel(node: { data?: { hName?: string; hProperties?: Record<string, unknown> } }, label: string) {
  const data = (node.data ??= {});
  data.hName = "div";
  data.hProperties = { className: ["md-pages-by-label"], "data-label": label };
}

function asRecentlyUpdated(node: { data?: { hName?: string; hProperties?: Record<string, unknown> } }, limit: number) {
  const data = (node.data ??= {});
  data.hName = "div";
  data.hProperties = { className: ["md-recently-updated"], "data-limit": String(limit) };
}

export function remarkContentMacros() {
  return (tree: Root) => {
    // 지시자로 파싱된 경우(보기 경로에서 remark-directive가 먼저 돈다)
    visit(tree, (node) => {
      if (node.type !== "leafDirective") return;
      const directive = node as typeof node & {
        name: string;
        attributes?: Record<string, string | null | undefined> | null;
        children?: Array<{ type: string; value?: string }>;
        data?: { hName?: string; hProperties?: Record<string, unknown> };
      };
      if (directive.name === "pages-by-label") {
        asPagesByLabel(directive, labelOf(directive.children));
        directive.children = [];
        return;
      }
      if (directive.name === "recently-updated") {
        asRecentlyUpdated(directive, parseRecentlyUpdatedLimit(directive.attributes?.limit));
        directive.children = [];
      }
    });

    // 텍스트로 남은 경우(편집기 왕복 후) — 같은 결과로 맞춘다
    visit(tree, "paragraph", (node: Paragraph) => {
      if (node.children.length !== 1) return;
      const only = node.children[0];
      if (only.type !== "text") return;
      const line = (only as Text).value.trim();

      const labelMatch = PAGES_BY_LABEL_TEXT_RE.exec(line);
      if (labelMatch) {
        node.children = [];
        asPagesByLabel(node, labelMatch[1].trim());
        return;
      }
      const recentMatch = RECENTLY_UPDATED_TEXT_RE.exec(line);
      if (recentMatch) {
        node.children = [];
        asRecentlyUpdated(node, parseRecentlyUpdatedLimit(limitFromAttrText(recentMatch[1])));
      }
    });
  };
}
