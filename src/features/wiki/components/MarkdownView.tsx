import { useRef, useState } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { Link } from "react-router";
import { Check, Copy } from "lucide-react";
import type { Page } from "../store/types";
import { resolveWikiLinks } from "../lib/wikiLinks";
import { remarkAlerts } from "../lib/remarkAlerts";

export interface MarkdownViewProps {
  /** 마크다운 원문 (Page.body 또는 편집 중인 입력값) */
  markdown: string;
  /** spaceId와 함께 주어지면 [[제목]]을 페이지 링크로 렌더한다 (같은 스페이스의 pages) */
  pages?: Page[];
  spaceId?: string;
}

/** 내부 경로(/...)는 react-router Link로, 생성 링크(new?title=)는 danger 스타일로 렌더 */
function WikiAnchor({
  href = "",
  children,
  node: _node,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
  if (href.startsWith("/")) {
    // pathname이 생성 화면일 때만 부재 링크로 표시 — 본문 중간의 우연한 substring 매치 방지
    const missing = href.split("?")[0].endsWith("/pages/new");
    return (
      <Link to={href} className={missing ? "wiki-link-missing" : "wiki-link"}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

/**
 * 코드블록 래퍼 — `<pre>`를 relative 컨테이너로 감싸고 우상단에 복사 버튼을 얹는다.
 * 복사 텍스트는 렌더된 pre의 textContent에서 읽는다(하이라이트 토큰 분할과 무관하게 원문 확보).
 */
function CodeCopyBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const text = ref.current?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근 불가(비보안 컨텍스트 등) — 조용히 무시한다
    }
  };
  return (
    <div className="markdown-pre">
      <pre ref={ref}>{children}</pre>
      <button
        type="button"
        className="markdown-code-copy"
        onClick={handleCopy}
        aria-label={copied ? "복사됨" : "코드 복사"}
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        <span>{copied ? "복사됨" : "복사"}</span>
      </button>
    </div>
  );
}

/**
 * 마크다운 렌더러 — react-markdown + remark-gfm(표) 래핑.
 * raw HTML은 렌더하지 않는다(react-markdown 기본값) — rehype-raw 추가 금지.
 * 요소 스타일은 app.css의 .markdown-body 스코프에서만 정의한다.
 * rehype-slug가 heading에 id를 부여해 TableOfContents의 `#slug` 링크가 실제로 스크롤된다 —
 * TableOfContents는 같은 github-slugger 버전으로 별도 계산하므로 slug 값이 서로 일치한다.
 */
export function MarkdownView({ markdown, pages, spaceId }: MarkdownViewProps) {
  const wikiMode = pages !== undefined && spaceId !== undefined;
  const source = wikiMode ? resolveWikiLinks(markdown, pages, spaceId) : markdown;
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkAlerts]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: false }]]}
        components={{ pre: CodeCopyBlock, ...(wikiMode ? { a: WikiAnchor } : {}) }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
