import GithubSlugger from "github-slugger";

export interface TocHeading {
  level: 1 | 2 | 3;
  slug: string;
  text: string;
}

/** 코드 펜스(``` 또는 ~~~) 시작 마커 — 앞 최대 3칸 들여쓰기까지 CommonMark와 동일하게 허용 */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
/** ATX 헤딩(# ~ ######) — 레벨과 나머지 텍스트를 캡처 */
const HEADING_RE = /^ {0,3}(#{1,6})(?:\s+(.*))?$/;

/**
 * heading 텍스트의 인라인 마크다운 서식을 단순 제거해 "렌더된 텍스트"에 근접시킨다.
 * rehype-slug는 hast-util-to-string으로 헤딩의 렌더 결과 텍스트를 slug 입력으로 쓰므로,
 * 굵게·기울임·위키링크·마크다운링크·인라인코드 문법은 라벨/내용 텍스트만 남겨야 일치도가 높아진다.
 * 완전한 마크다운 파서가 아니므로 이스케이프 문자나 중첩 서식 등 일부 케이스는 어긋날 수 있다.
 */
function stripInlineMarkdown(raw: string): string {
  return raw
    // [[위키링크]] → 라벨. resolveWikiLinks(lib/wikiLinks.ts)는 title=raw.trim()로 내부 패딩을
    // 제거하므로 여기서도 캡처 그룹을 trim해야("$1" 그대로 쓰면 안 됨) rehype-slug 결과와 일치한다.
    .replace(/\[\[([^[\]\n]+)\]\]/g, (_match, inner: string) => inner.trim())
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // 이미지는 대체텍스트 없이 제거
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [라벨](url) → 라벨
    .replace(/(\*\*\*|___)(.+?)\1/g, "$2") // 굵게+기울임
    .replace(/(\*\*|__)(.+?)\1/g, "$2") // 굵게
    .replace(/(\*|_)(.+?)\1/g, "$2") // 기울임
    .replace(/`([^`]+)`/g, "$1") // 인라인 코드
    .replace(/\s+#+\s*$/, "") // ATX 종료 시퀀스("## 제목 ##")의 꼬리 # 제거
    .trim();
}

/**
 * 마크다운에서 ATX heading(1~6레벨)을 라인 스캔으로 추출한다. 코드 펜스 내부의 `#` 줄은 제외한다.
 * heading 텍스트는 이후 slug 계산에만 쓰이고, 반환값은 아직 레벨 필터링 전이다 —
 * rehype-slug가 문서의 h1~h6 전체를 순서대로 slug하기 때문에, h4~h6도 같은 슬러거로 함께
 * 소비해야 h1~h3 중복 heading의 번호(-1, -2 …)가 실제 렌더 결과와 어긋나지 않는다.
 */
function scanHeadingLines(markdown: string): { level: number; text: string }[] {
  const lines = markdown.split(/\r?\n/);
  const headings: { level: number; text: string }[] = [];
  let fenceChar: string | null = null;
  let fenceLen = 0;

  for (const line of lines) {
    if (fenceChar !== null) {
      const closeMatch = FENCE_RE.exec(line);
      if (closeMatch && closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLen) {
        fenceChar = null;
      }
      continue; // 펜스 내부(닫는 줄 포함)는 heading으로 취급하지 않는다
    }
    const openMatch = FENCE_RE.exec(line);
    if (openMatch) {
      fenceChar = openMatch[1][0];
      fenceLen = openMatch[1].length;
      continue;
    }
    const headingMatch = HEADING_RE.exec(line);
    if (!headingMatch) continue;
    const text = (headingMatch[2] ?? "").trim();
    if (text.length === 0) continue; // 내용 없는 "#"만 있는 줄은 제외
    headings.push({ level: headingMatch[1].length, text });
  }
  return headings;
}

/**
 * markdown → TOC용 heading 목록(레벨 1~3만). rehype-slug(github-slugger)와 동일한 slugger로
 * 순서대로 slug를 계산해 렌더된 heading id와 값이 일치하도록 한다.
 */
export function extractHeadings(markdown: string): TocHeading[] {
  const slugger = new GithubSlugger();
  const result: TocHeading[] = [];
  for (const { level, text } of scanHeadingLines(markdown)) {
    const cleaned = stripInlineMarkdown(text);
    const slug = slugger.slug(cleaned); // h4~h6도 호출해 occurrence 카운터를 rehype-slug와 동기화
    if (level <= 3 && cleaned.length > 0) {
      result.push({ level: level as 1 | 2 | 3, slug, text: cleaned });
    }
  }
  return result;
}

export interface TableOfContentsProps {
  /** 페이지 본문 원문 마크다운 */
  markdown: string;
}

/**
 * 본문에서 heading 1~3을 뽑아 목차를 렌더한다. heading이 3개 미만이면 짧은 문서로 보고
 * 목차 소음을 피하기 위해 아무것도 렌더하지 않는다(null).
 */
export function TableOfContents({ markdown }: TableOfContentsProps) {
  const headings = extractHeadings(markdown);
  if (headings.length < 3) return null;

  return (
    <nav className="page-toc" aria-label="목차">
      <ul>
        {headings.map((h) => (
          <li key={h.slug} className={`page-toc-level-${h.level}`}>
            <a href={`#${h.slug}`}>{h.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
