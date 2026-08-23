import { useEffect, useState } from "react";
import GithubSlugger from "github-slugger";
import { WIKI_LINK_SOURCE } from "../lib/wikiLinks";

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
    // 제거하므로 여기서도 캡처 그룹을 trim해야 WIKI_LINK_SOURCE 기준에 맞춰서 rehype-slug 결과와 일치한다.
    .replace(new RegExp(WIKI_LINK_SOURCE, "g"), (_match, inner: string) => inner.trim())
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
  /**
   * `"aside"`(기본) — 화면이 자동으로 붙이는 사이드 목차. 짧은 문서에서는 소음이라 숨긴다.
   * `"inline"` — 사용자가 본문에 `::toc`로 **직접 심은** 목차. 숨기지 않는다:
   * 넣었는데 아무것도 안 보이면 고장으로 읽힌다.
   */
  variant?: "aside" | "inline";
}

/**
 * 본문에서 heading 1~3을 뽑아 목차를 렌더한다.
 * 자동 사이드 목차(aside)는 heading이 3개 미만이면 렌더하지 않는다(짧은 문서의 목차 소음 방지).
 */
export function TableOfContents({ markdown, variant = "aside" }: TableOfContentsProps) {
  const headings = extractHeadings(markdown);
  const inline = variant === "inline";
  // 스크롤스파이 — 지금 읽고 있는 섹션을 사이드 목차에서 강조한다(휴리스틱 #1 상태 가시성).
  // rootMargin 하단 -70%: 뷰포트 위쪽 30% 밴드에 들어온 heading을 "현재"로 본다.
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  useEffect(() => {
    if (inline || typeof IntersectionObserver === "undefined") return; // jsdom·인라인은 제외
    const targets = Array.from(
      document.querySelectorAll(".markdown-body :is(h1, h2, h3)[id]"),
    );
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSlug(visible[0].target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [markdown, inline]);
  if (!inline && headings.length < 3) return null;

  if (inline && headings.length === 0) {
    // 심어는 뒀는데 제목이 없는 상태 — 왜 비어 있는지 알려준다
    return (
      <nav className="page-toc page-toc--inline" aria-label="목차">
        <p className="page-toc-empty">제목을 추가하면 목차가 만들어집니다.</p>
      </nav>
    );
  }

  return (
    <nav className={`page-toc${inline ? " page-toc--inline" : ""}`} aria-label="목차">
      <ul>
        {headings.map((h) => (
          <li key={h.slug} className={`page-toc-level-${h.level}`}>
            <a
              href={`#${h.slug}`}
              className={!inline && h.slug === activeSlug ? "page-toc-active" : undefined}
              aria-current={!inline && h.slug === activeSlug ? "true" : undefined}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
