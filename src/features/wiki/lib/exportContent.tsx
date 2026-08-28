import type { Page, PageNode } from "../store/types";
import {
  attachmentIdFromInlineUrl,
  fetchInlineAttachment,
  getPage,
  listDescendants,
  lookupPagesByTitle,
} from "../store/wikiStore";
import { extractWikiLinkTitles, normalizeWikiTitle } from "./wikiLinks";

/**
 * 페이지 내보내기(W21-3) — 컨플루언스의 "내보내기"에 해당한다.
 *
 * 왜 필요한가: 지금까지 이 위키에서 내용을 꺼낼 방법이 전혀 없었다. 도구를 바꾸거나 감사 자료를
 * 넘겨야 할 때 탈출 경로가 없는 것은 문서 시스템의 결함이다(갭 분석 §3.6).
 *
 * 형식은 Markdown과 HTML 둘이다. 저장 형식이 마크다운 문자열이므로 Markdown은 무손실이고,
 * HTML은 "받는 사람이 그냥 열어볼 수 있는" 형식으로 이미지를 data URI로 심어 자기완결로 만든다.
 * PDF는 브라우저 인쇄(인쇄 → PDF로 저장)로 대신한다 — 서버 렌더러 없이 만든 PDF는 표·코드
 * 블록에서 화면과 어긋나 오히려 신뢰를 깎는다.
 *
 * 하위 수집은 서버 후손 API를 쓴다(2026-08-28) — 화면이 스페이스 전량을 들고 있지 않아도 된다.
 */

export interface ExportInput {
  /** 내보낼 루트 페이지 */
  root: Page;
  /** 하위 문서 포함 여부 */
  includeChildren: boolean;
}

/**
 * 후손 노드를 트리 순서(깊이 우선 · 형제는 position 순)로 편다.
 * 서버는 순서를 보장하지 않으므로 여기서 부모·순번으로 다시 세운다. 순환 데이터에서도 멈춘다.
 */
export function orderSubtree(rootId: string, descendants: PageNode[]): PageNode[] {
  const childrenOf = new Map<string, PageNode[]>();
  for (const node of descendants) {
    const key = node.parentId ?? "";
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), node]);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
  }
  const ordered: PageNode[] = [];
  const visited = new Set([rootId]);
  const walk = (parentId: string) => {
    for (const child of childrenOf.get(parentId) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      ordered.push(child);
      walk(child.id);
    }
  };
  walk(rootId);
  return ordered;
}

/** 파일명으로 쓸 수 없는 문자를 지운다(윈도우 기준이 가장 좁다). */
export function toFileName(title: string, extension: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, "").trim() || "문서";
  return `${safe}.${extension}`;
}

/** 내보낼 문서 수 — 다이얼로그가 "몇 개를 내보내는지" 먼저 알려주는 데 쓴다. */
export async function countForExport(root: Page, includeChildren: boolean): Promise<number> {
  if (!includeChildren) return 1;
  return 1 + (await listDescendants(root.id)).length;
}

async function loadPages(input: ExportInput): Promise<Page[]> {
  if (!input.includeChildren) return [input.root];
  const ordered = orderSubtree(input.root.id, await listDescendants(input.root.id));
  // 트리 노드에는 본문이 없다 — 내보내기는 본문이 목적이라 반드시 다시 읽는다.
  const loaded = await Promise.all(ordered.map((node) => getPage(node.id)));
  return [input.root, ...loaded.filter((p): p is Page => p !== null)];
}

/** 내보내는 문서 전체의 `[[제목]]`을 한 번에 조회한다 — 문서마다 왕복하지 않는다. */
async function linkTargetsFor(pages: Page[], spaceId: string): Promise<Map<string, string>> {
  const titles = [...new Set(pages.flatMap((p) => extractWikiLinkTitles(p.body)))];
  const map = new Map<string, string>();
  if (titles.length === 0) return map;
  for (const node of await lookupPagesByTitle(spaceId, titles)) {
    const normalized = normalizeWikiTitle(node.title);
    if (!map.has(normalized)) map.set(normalized, node.id);
  }
  return map;
}

export async function buildMarkdownExport(input: ExportInput): Promise<string> {
  const ordered = await loadPages(input);
  return ordered
    .map((page) => `# ${page.title}\n\n${page.body}`.trimEnd())
    .join("\n\n---\n\n")
    .concat("\n");
}

/**
 * 본문의 첨부 이미지 참조를 data URI로 바꾼다 — 인증이 필요한 URL 그대로 두면 받은 사람의
 * 브라우저에서 전부 깨진 이미지가 된다. 못 읽은 이미지는 원래 참조를 남긴다(조용히 지우지 않는다).
 */
async function embedImages(markdown: string): Promise<string> {
  const urls = [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const unique = [...new Set(urls)].filter((url) => attachmentIdFromInlineUrl(url) !== null);
  let result = markdown;
  for (const url of unique) {
    const id = attachmentIdFromInlineUrl(url);
    if (id === null) continue;
    try {
      const blob = await fetchInlineAttachment(id);
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("이미지를 읽을 수 없습니다"));
        reader.readAsDataURL(blob);
      });
      result = result.split(url).join(dataUri);
    } catch {
      // 이미지 하나 때문에 내보내기 전체를 실패시키지 않는다
    }
  }
  return result;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 보기 화면과 같은 렌더러(MarkdownView)로 HTML을 만든다 — 별도 변환 파이프라인을 두면
 * 확장 문법(패널·컬럼·표 병합)에서 화면과 내보낸 문서가 어긋난다.
 * react-dom/server는 동적 import라 이 기능을 쓸 때만 번들을 받는다.
 *
 * 렌더가 동기라 링크 대상은 미리 조회해 넘긴다(MarkdownView의 linkTargets).
 */
export async function buildHtmlExport(input: ExportInput): Promise<string> {
  const [{ renderToStaticMarkup }, { MarkdownView }] = await Promise.all([
    import("react-dom/server"),
    import("../components/MarkdownView"),
  ]);
  const ordered = await loadPages(input);
  const targets = await linkTargetsFor(ordered, input.root.spaceId);
  const sections = await Promise.all(
    ordered.map(async (page) => {
      const body = await embedImages(page.body);
      const html = renderToStaticMarkup(
        <MarkdownView markdown={body} spaceId={page.spaceId} linkTargets={targets} />,
      );
      return `<section><h1>${escapeHtml(page.title)}</h1>${html}</section>`;
    }),
  );
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.root.title)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.6;
         max-width: 820px; margin: 2rem auto; padding: 0 1rem; color: #172b4d; }
  img { max-width: 100%; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #dfe1e6; padding: 6px 10px; }
  pre { background: #f4f5f7; padding: 12px; overflow-x: auto; }
  code { background: #f4f5f7; padding: 1px 4px; }
  section + section { border-top: 1px solid #dfe1e6; margin-top: 2.5rem; padding-top: 2.5rem; }
</style>
</head>
<body>
${sections.join("\n")}
</body>
</html>
`;
}

/** Blob을 내려받는다 — 브라우저 밖(테스트·SSR)에서는 아무것도 하지 않는다. */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
