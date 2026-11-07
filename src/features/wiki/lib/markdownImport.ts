/**
 * Markdown 가져오기 규칙 — 백엔드 `MarkdownImportService`와 같은 규칙을 목업이 그대로 쓰도록 한 곳에 둔다.
 *
 * - 한 번에 20개, 파일당 1MB, 확장자 .md/.markdown, UTF-8 텍스트(NUL 없음).
 * - 제목: 앞머리(front matter) `title:` → 맨 앞 `# 제목` 줄 → 파일 이름. 제목으로 쓴 줄은 본문에서 뺀다.
 * - 상대 경로 이미지(`./img.png`)는 해석하지 않고 경고로 센다.
 */

export const MARKDOWN_IMPORT_MAX_FILES = 20;
export const MARKDOWN_IMPORT_MAX_BYTES = 1024 * 1024;
const MAX_TITLE = 255;

/** 파일 선택 창 필터 — 서버 판정은 확장자와 본문이다(브라우저가 .md에 붙이는 MIME은 제각각). */
export const MARKDOWN_IMPORT_ACCEPT = ".md,.markdown,text/markdown";

export function isMarkdownFileName(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

export interface ParsedMarkdown {
  title: string;
  body: string;
  relativeImages: number;
}

const HEADING_TITLE = /^#\s+(.+?)(?:\s+#+)?\s*$/;
const FRONT_MATTER_TITLE = /^title\s*:\s*(?:"(.*)"|'(.*)'|(.*?))\s*$/m;
const IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g;

export function parseMarkdownFile(fileName: string, raw: string): ParsedMarkdown {
  let text = raw.startsWith("﻿") ? raw.slice(1) : raw;
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let title: string | null = null;
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---", 3);
    if (end > 0 && (end + 4 === text.length || text.charAt(end + 4) === "\n")) {
      const m = FRONT_MATTER_TITLE.exec(text.slice(4, end));
      if (m) title = m[1] ?? m[2] ?? m[3] ?? null;
      text = text.slice(Math.min(text.length, end + 5));
    }
  }
  if (!title || !title.trim()) {
    const stripped = text.replace(/^\s+/, "");
    const lineEnd = stripped.indexOf("\n");
    const firstLine = lineEnd < 0 ? stripped : stripped.slice(0, lineEnd);
    const m = HEADING_TITLE.exec(firstLine);
    if (m) {
      title = m[1];
      text = lineEnd < 0 ? "" : stripped.slice(lineEnd + 1);
    }
  }
  if (!title || !title.trim()) title = fileName.replace(/\.(md|markdown)$/i, "");
  title = title.trim() || "제목 없음";
  if (title.length > MAX_TITLE) title = title.slice(0, MAX_TITLE);

  const body = text.replace(/^\n+/, "");
  return { title, body, relativeImages: countRelativeImages(body) };
}

function countRelativeImages(body: string): number {
  let count = 0;
  for (const m of body.matchAll(IMAGE)) {
    const url = m[1].toLowerCase();
    const resolvable =
      url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/") || url.startsWith("data:");
    if (!resolvable) count++;
  }
  return count;
}

export function relativeImageWarning(count: number): string {
  return `상대 경로 이미지 ${count}개는 가져오지 못했습니다. 문서에 이미지를 직접 첨부하세요.`;
}

/** zip 가져오기(폴더 트리·첨부·문서 링크)는 서버만 한다 — 목업 모드에서는 받지 않는다. */
export const MARKDOWN_IMPORT_ACCEPT_WITH_ZIP = `${MARKDOWN_IMPORT_ACCEPT},.zip,application/zip`;

export function isZipFileName(name: string): boolean {
  return /\.zip$/i.test(name);
}

/**
 * 고른 파일 묶음 검사 — 서버와 같은 규칙. .md 여러 개(최대 20) 또는 zip 하나(다른 파일 없이).
 * 문제가 없으면 null, 있으면 사용자에게 그대로 보일 문구.
 */
export function validateImportSelection(names: string[], allowZip: boolean): string | null {
  if (names.length === 0) return null;
  const zips = names.filter(isZipFileName);
  if (allowZip && zips.length > 0) {
    return names.length === 1 ? null : "zip 파일은 한 번에 하나만, 다른 파일 없이 가져올 수 있습니다";
  }
  const rejected = names.filter((n) => !isMarkdownFileName(n));
  if (rejected.length > 0) {
    return `${allowZip ? "Markdown 파일(.md, .markdown) 또는 zip" : "Markdown 파일(.md, .markdown)"}만 가져올 수 있습니다: ${rejected.join(", ")}`;
  }
  if (names.length > MARKDOWN_IMPORT_MAX_FILES) return `한 번에 ${MARKDOWN_IMPORT_MAX_FILES}개까지 가져올 수 있습니다`;
  return null;
}
