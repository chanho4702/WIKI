import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface MarkdownViewProps {
  /** 마크다운 원문 (Page.body 또는 편집 중인 입력값) */
  markdown: string;
}

/**
 * 마크다운 렌더러 — react-markdown + remark-gfm(표) 래핑.
 * raw HTML은 렌더하지 않는다(react-markdown 기본값) — rehype-raw 추가 금지.
 * 요소 스타일은 app.css의 .markdown-body 스코프에서만 정의한다.
 */
export function MarkdownView({ markdown }: MarkdownViewProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}
