/**
 * 발췌(excerpt, W23) — 컨플루언스의 Excerpt / Excerpt Include 매크로.
 *
 * ## 저장 포맷
 *
 * 원본 문서는 `:::excerpt` 컨테이너로 "다른 곳에서 가져다 쓸 부분"을 표시하고,
 * 가져다 쓰는 문서는 `::excerpt-include[제목]` 한 줄을 둔다. 둘 다 remark-directive 문법 가족
 * (`:::columns`·`::toc`)이라 새 개념을 들이지 않고 `Page.body`는 계속 마크다운 문자열이다.
 *
 * ## 편집기 이스케이프
 *
 * 편집기(markdown-it)는 이 지시자를 모른다 — 텍스트 문단으로 남고, 직렬화기가 여는 콜론을
 * `\:`로 이스케이프할 수 있다(`::toc`와 같은 사정). 지시자 파서가 그것을 못 읽으므로 보기 경로
 * 진입 전에 여기서 되돌린다. 이스케이프된 형태는 **줄 전체가 지시자인 경우**에만 풀어 본문의
 * 일반 텍스트(`\:` 리터럴)를 건드리지 않는다.
 */

const ESCAPED_DIRECTIVE_LINE = /^(\\?:){2,}(?:(?:excerpt-include\[[^\]]*\])|excerpt)?[ \t]*$/;

export function normalizeDirectiveEscapes(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => (ESCAPED_DIRECTIVE_LINE.test(line) ? line.replace(/\\:/g, ":") : line))
    .join("\n")
    // 인라인 상태 배지(`\:status[…]`)는 줄 전체가 아니라 토큰으로 푼다 — 그 토큰은 본문에 달리 나올 수 없다
    .replace(/\\:status\[/g, ":status[");
}

const OPEN_RE = /^:{3,}[ \t]*excerpt[ \t]*$/;
const CLOSE_RE = /^:{3,}[ \t]*$/;

/**
 * 원본 마크다운에서 `:::excerpt` … `:::` 사이를 뽑는다. 없으면 null — 발췌 블록이 없는 문서를
 * 첫 문단으로 대신하지 않는다: 작성자가 "가져다 써도 되는 부분"을 정하지 않은 문서다.
 * 여러 개면 첫 번째다.
 */
export function extractExcerpt(markdown: string): string | null {
  const lines = normalizeDirectiveEscapes(markdown).split("\n");
  const start = lines.findIndex((l) => OPEN_RE.test(l));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => CLOSE_RE.test(l));
  const body = (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
  return body.length === 0 ? null : body;
}

/** 포함 지시자의 제목 — `::excerpt-include[제목]`. 렌더러와 같은 기준으로 다듬는다(trim). */
export function parseExcerptIncludeTitle(line: string): string | null {
  const m = /^:{2,}[ \t]*excerpt-include\[([^\]]*)\][ \t]*$/.exec(normalizeDirectiveEscapes(line).trim());
  const title = m?.[1]?.trim() ?? "";
  return title.length === 0 ? null : title;
}
