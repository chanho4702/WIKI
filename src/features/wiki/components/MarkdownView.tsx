import type { AnchorHTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router";
import type { Page } from "../store/types";
import { resolveWikiLinks } from "../lib/wikiLinks";

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
    const missing = href.includes("/pages/new?");
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
 * 마크다운 렌더러 — react-markdown + remark-gfm(표) 래핑.
 * raw HTML은 렌더하지 않는다(react-markdown 기본값) — rehype-raw 추가 금지.
 * 요소 스타일은 app.css의 .markdown-body 스코프에서만 정의한다.
 */
export function MarkdownView({ markdown, pages, spaceId }: MarkdownViewProps) {
  const wikiMode = pages !== undefined && spaceId !== undefined;
  const source = wikiMode ? resolveWikiLinks(markdown, pages, spaceId) : markdown;
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={wikiMode ? { a: WikiAnchor } : undefined}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
