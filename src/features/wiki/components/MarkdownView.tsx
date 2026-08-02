import { useEffect, useRef, useState } from "react";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { Link } from "react-router";
import {
  Check,
  CircleCheck,
  Copy,
  Info,
  OctagonAlert,
  StickyNote,
  TriangleAlert,
} from "lucide-react";
import type { Page } from "../store/types";
import { resolveWikiLinks } from "../lib/wikiLinks";
import { remarkAlerts } from "../lib/remarkAlerts";
import { remarkColumns } from "../lib/remarkColumns";
import { showsLineNumbers, useCodeBlockPrefs } from "../lib/codeBlockPrefs";
import { CodeLineNumbers } from "./CodeLineNumbers";

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
 * 패널 아이콘 — 저장 마커별로 고정한다(기획 P7 매핑표, `lib/remarkAlerts.ts`).
 * 라벨 텍스트가 이미 접근성 이름을 제공하므로 아이콘은 `aria-hidden`이다.
 */
const ALERT_ICONS: Record<string, typeof Info> = {
  "md-alert-note": Info, // 정보(파랑)
  "md-alert-tip": CircleCheck, // 성공(초록)
  "md-alert-important": StickyNote, // 노트(보라)
  "md-alert-warning": TriangleAlert, // 경고(노랑)
  "md-alert-caution": OctagonAlert, // 주의(빨강)
};

/**
 * div 렌더 가로채기 — 패널이면 아이콘을 얹고, 그 외(컬럼 레이아웃의 md-columns/md-column 등)는
 * 그대로 통과시킨다. remarkAlerts가 만든 클래스만 보고 판단한다.
 *
 * 에디터 쪽(alertDecoration)은 blockquote에 클래스만 얹는 데코레이션이라 아이콘이 없다 —
 * 편집 화면에는 `[!NOTE]` 마커 텍스트가 그대로 보이는 게 편집 어포던스이기 때문이다.
 */
function MarkdownDiv({
  className,
  children,
  node: _node,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { node?: unknown }) {
  const alertClass = className?.split(/\s+/).find((c) => c in ALERT_ICONS);
  if (!alertClass) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }
  const Icon = ALERT_ICONS[alertClass];
  return (
    <div className={className} {...rest}>
      <Icon className="md-alert-icon" size={16} aria-hidden="true" />
      <div className="md-alert-content">{children}</div>
    </div>
  );
}

/**
 * 코드블록 래퍼 — `<pre>`를 relative 컨테이너로 감싸고 우상단에 복사 버튼을 얹는다.
 * 복사 텍스트는 렌더된 pre의 textContent에서 읽는다(하이라이트 토큰 분할과 무관하게 원문 확보).
 *
 * 줄 번호는 편집 화면(CodeBlockView)에만 있으면 안 된다 — 문서를 "열었을 때" 보여야 하고,
 * 보기는 여기가 유일한 경로다. 거터는 `<pre>` **바깥**에 둔다: 복사가 `pre.textContent`라
 * 안에 넣으면 번호까지 복사된다(드래그 복사도 마찬가지).
 */
function CodeCopyBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const { prefs } = useCodeBlockPrefs();
  const numbered = showsLineNumbers(prefs);

  // 하이라이트 토큰 트리라 children에서 텍스트를 뽑기 어렵다 — 렌더된 DOM에서 읽는다.
  // 줄 수만 필요하므로 레이아웃 전에 확정할 필요가 없다(useEffect로 충분).
  useEffect(() => {
    setCode(ref.current?.textContent ?? "");
  }, [children]);

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
    <div
      className={`markdown-pre${numbered ? " markdown-pre--numbered" : ""}${
        prefs.wrap ? " markdown-pre--wrap" : ""
      }`}
    >
      <div className="code-block-body">
        {numbered && <CodeLineNumbers code={code} />}
        <pre ref={ref}>{children}</pre>
      </div>
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
      {/* remarkDirective가 `:::` 문법을 노드로 만들고 remarkColumns가 그걸 div로 매핑한다 —
        * 순서가 뒤바뀌면 매핑할 노드가 아직 없다. */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkDirective, remarkColumns, remarkAlerts]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: false }]]}
        components={{ pre: CodeCopyBlock, div: MarkdownDiv, ...(wikiMode ? { a: WikiAnchor } : {}) }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
