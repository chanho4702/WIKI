import { useEffect, useMemo, useRef, useState } from "react";
import type { AnchorHTMLAttributes, HTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
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
  Link2,
} from "lucide-react";
import { resolveWikiLinks } from "../lib/wikiLinks";
import { useWikiLinkTargets } from "../lib/useWikiLinkTargets";
import { useResolvedWikiImage } from "../lib/useResolvedWikiImage";
import { remarkAlerts } from "../lib/remarkAlerts";
import { remarkColumns } from "../lib/remarkColumns";
import { remarkDetails } from "../lib/remarkDetails";
import { remarkExcerpt } from "../lib/remarkExcerpt";
import { normalizeDirectiveEscapes } from "../lib/excerpt";
import { ExcerptInclude } from "./ExcerptInclude";
import { remarkTextColors } from "../lib/remarkTextColors";
import { rehypeTableSpans } from "../lib/rehypeTableSpans";
import { remarkBookmark } from "../lib/remarkBookmark";
import { parseImageWidth } from "../lib/imageAttrs";
import { mentionUserIdFromHref } from "../editor/extensions/userMention";
import { dateFromHref, formatDateLabel } from "../editor/extensions/dateMention";
import { remarkToc } from "../lib/remarkToc";
import { showsLineNumbers, useCodeBlockPrefs } from "../lib/codeBlockPrefs";
import { CodeLineNumbers } from "./CodeLineNumbers";
import { TableOfContents } from "./TableOfContents";

export interface MarkdownViewProps {
  /** 마크다운 원문 (Page.body 또는 편집 중인 입력값) */
  markdown: string;
  /**
   * 주어지면 `[[제목]]`을 같은 스페이스의 페이지 링크로 렌더한다.
   * 대상 조회는 본문에 등장한 제목만 서버에 묻는다(2026-08-28) — 화면이 스페이스 전량을
   * 들고 있을 필요가 없다.
   */
  spaceId?: string;
  /**
   * 발췌 포함 깊이(W23). 0이 본문, 1이 발췌 안이다. 1에서는 `::excerpt-include`를 더 따라가지
   * 않는다 — 서로를 포함하는 두 문서가 무한히 펼쳐지는 것을 막는다.
   */
  depth?: number;
  /**
   * 링크 대상을 이미 알고 있을 때 넘긴다(제목 → 페이지 id). 내보내기처럼 렌더가 동기여야 하는
   * 경로가 쓴다 — 넘기면 서버 조회를 하지 않는다.
   */
  linkTargets?: ReadonlyMap<string, string>;
}

/**
 * 사용자 멘션 칩 — `[@이름](user:id)` 저장 문법(editor/extensions/userMention.ts)의 보기 렌더.
 * 프로필 화면이 아직 없어 링크가 아니라 칩(span)으로 그린다 — 후속: 프로필/필터 연결.
 */
function MentionChip({ userId, children }: { userId: string; children?: unknown }) {
  return (
    <span className="user-mention" data-user-id={userId}>
      {children as never}
    </span>
  );
}

/** 날짜 칩 — `[ISO](date:ISO)` 저장 문법의 보기 렌더. 표시 포맷은 에디터 칩과 동일하다. */
function DateChip({ iso }: { iso: string }) {
  return (
    <span className="date-mention" data-date={iso}>
      {formatDateLabel(iso)}
    </span>
  );
}

/** wikiMode 밖에서 쓰는 최소 a 렌더 — 멘션만 칩으로 바꾸고 나머지는 표준 앵커. */
function MentionOnlyAnchor({
  href = "",
  children,
  node: _node,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
  const mentionId = mentionUserIdFromHref(href);
  if (mentionId) return <MentionChip userId={mentionId}>{children}</MentionChip>;
  const dateIso = dateFromHref(href);
  if (dateIso) return <DateChip iso={dateIso} />;
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

/** 내부 경로(/...)는 react-router Link로, 생성 링크(new?title=)는 danger 스타일로 렌더 */
function WikiAnchor({
  href = "",
  children,
  node: _node,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
  const mentionId = mentionUserIdFromHref(href);
  if (mentionId) return <MentionChip userId={mentionId}>{children}</MentionChip>;
  const dateIso = dateFromHref(href);
  if (dateIso) return <DateChip iso={dateIso} />;
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
  source,
  spaceId,
  depth = 0,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  node?: unknown;
  source?: string;
  spaceId?: string;
  depth?: number;
  "data-title"?: string;
}) {
  // 본문 목차(`::toc`) — remarkToc가 표시한 자리에 실제 목차를 그린다.
  // heading은 본문 전체에서 뽑으므로 사이드 목차와 같은 추출기를 쓴다(slug 계산도 동일).
  if (className?.split(/\s+/).includes("md-toc")) {
    return <TableOfContents markdown={source ?? ""} variant="inline" />;
  }
  // 발췌 포함(`::excerpt-include[제목]`, W23) — 스페이스를 알고 한 단계 안일 때만 실제로 가져온다.
  if (className?.split(/\s+/).includes("md-excerpt-include")) {
    const title = (rest["data-title"] ?? "").trim();
    if (!spaceId || depth > 0 || !title) {
      return <div className="md-excerpt-include is-inert">::excerpt-include[{title}]</div>;
    }
    return (
      <ExcerptInclude
        title={title}
        spaceId={spaceId}
        render={(md) => <MarkdownView markdown={md} spaceId={spaceId} depth={depth + 1} />}
      />
    );
  }
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

function MarkdownImage({ src = "", alt = "", title, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const resolved = useResolvedWikiImage(src);
  // 표시 폭은 src의 `#w=` 프래그먼트(lib/imageAttrs.ts), 캡션은 표준 title — 편집 화면과 같은 해석
  const width = parseImageWidth(src);
  if (resolved.loading) return <span role="status">이미지 불러오는 중…</span>;
  if (resolved.error || !resolved.resolvedSrc) {
    return <span className="image-view-broken">{alt || "이미지를 불러올 수 없습니다"}</span>;
  }
  const img = (
    <img
      {...props}
      src={resolved.resolvedSrc}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      style={width ? { width: `${width}px` } : undefined}
    />
  );
  // img는 p 안의 인라인 콘텐츠 — figure/figcaption을 쓰면 invalid HTML이라 span으로 묶는다
  if (!title) return img;
  return (
    <span className="md-figure">
      {img}
      <span className="md-figcaption">{title}</span>
    </span>
  );
}

/**
 * 헤딩 끝의 앵커 버튼(W23) — 누르면 이 섹션의 URL(`…#slug`)을 복사한다.
 *
 * rehype-slug가 id를 이미 붙여 두고 있었는데 그 id를 복사할 방법이 없어서, 문서의 한 절을
 * 가리키려면 주소창에서 손으로 `#`을 붙여야 했다.
 *
 * 글자 없이 아이콘만 둔다 — 인라인 댓글 앵커가 렌더된 본문의 **텍스트**로 구간을 잡으므로,
 * "#" 같은 글자가 헤딩 텍스트에 섞이면 인용 매칭이 어긋난다.
 */
function AnchorHeading({
  level,
  id,
  children,
  node: _node,
  ...rest
}: HTMLAttributes<HTMLHeadingElement> & { level: 1 | 2 | 3 | 4 | 5 | 6; node?: unknown }) {
  // 토스트를 쓰지 않는다 — 이 렌더러는 미리보기·내보내기 등 Provider 밖에서도 그려진다.
  // 복사 결과는 버튼 자체가 잠깐 "복사됨"으로 바뀌어 알린다.
  const [copied, setCopied] = useState(false);
  const Tag = `h${level}` as const;
  const copy = async () => {
    if (!id) return;
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드가 막힌 환경(권한·비보안 컨텍스트) — 조용히 둔다. 주소창의 #은 그대로 쓸 수 있다.
    }
  };
  return (
    <Tag id={id} {...rest}>
      {children}
      {id ? (
        <button
          type="button"
          className={copied ? "heading-anchor is-copied" : "heading-anchor"}
          aria-label={copied ? "섹션 링크 복사됨" : "섹션 링크 복사"}
          title="섹션 링크 복사"
          onClick={() => void copy()}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
        </button>
      ) : null}
    </Tag>
  );
}

/**
 * 마크다운 렌더러 — react-markdown + remark-gfm(표) 래핑.
 * raw HTML은 렌더하지 않는다(react-markdown 기본값) — rehype-raw 추가 금지.
 * 요소 스타일은 app.css의 .markdown-body 스코프에서만 정의한다.
 * rehype-slug가 heading에 id를 부여해 TableOfContents의 `#slug` 링크가 실제로 스크롤된다 —
 * TableOfContents는 같은 github-slugger 버전으로 별도 계산하므로 slug 값이 서로 일치한다.
 */
export function MarkdownView({ markdown, spaceId, linkTargets, depth = 0 }: MarkdownViewProps) {
  // spaceId가 있어야 [[제목]]을 어느 스페이스에서 찾을지 정해진다 — 없으면 위키 링크 모드가 아니다.
  const wikiMode = spaceId !== undefined;
  const fetched = useWikiLinkTargets(linkTargets ? "" : markdown, spaceId);
  const targets = linkTargets ?? fetched;
  // 편집기가 이스케이프한 발췌 지시자(`\:\:\:excerpt`)를 되돌린다 — 파서가 그 형태를 못 읽는다.
  const normalized = normalizeDirectiveEscapes(markdown);
  const source = wikiMode ? resolveWikiLinks(normalized, targets, spaceId) : normalized;

  // 목차는 본문 전체를 봐야 만들 수 있다 — div 렌더러가 source를 알아야 해서 여기서 닫는다.
  const components = useMemo(
    () => ({
      pre: CodeCopyBlock,
      img: MarkdownImage,
      div: (props: HTMLAttributes<HTMLDivElement> & { node?: unknown }) => (
        <MarkdownDiv {...props} source={source} spaceId={spaceId} depth={depth} />
      ),
      // 멘션 칩은 모드와 무관하게 필요하다 — wikiMode가 아니면 멘션 외 링크는 기본 렌더로 흘린다
      a: wikiMode ? WikiAnchor : MentionOnlyAnchor,
      h1: (p: HTMLAttributes<HTMLHeadingElement>) => <AnchorHeading level={1} {...p} />,
      h2: (p: HTMLAttributes<HTMLHeadingElement>) => <AnchorHeading level={2} {...p} />,
      h3: (p: HTMLAttributes<HTMLHeadingElement>) => <AnchorHeading level={3} {...p} />,
      h4: (p: HTMLAttributes<HTMLHeadingElement>) => <AnchorHeading level={4} {...p} />,
      h5: (p: HTMLAttributes<HTMLHeadingElement>) => <AnchorHeading level={5} {...p} />,
      h6: (p: HTMLAttributes<HTMLHeadingElement>) => <AnchorHeading level={6} {...p} />,
    }),
    [source, wikiMode, spaceId, depth],
  );

  return (
    <div className="markdown-body">
      {/* remarkDirective가 `:::`·`::` 문법을 노드로 만들고 remarkColumns/remarkToc가 그걸 div로
        * 매핑한다 — 순서가 뒤바뀌면 매핑할 노드가 아직 없다. */}
      <ReactMarkdown
        // 기본 urlTransform은 http(s)·mailto 등만 허용해 `user:` 멘션 href를 지운다 — 이 스킴만 통과
        urlTransform={(url) => (mentionUserIdFromHref(url) || dateFromHref(url) ? url : defaultUrlTransform(url))}
        remarkPlugins={[remarkGfm, remarkDirective, remarkTextColors, remarkBookmark, remarkDetails, remarkExcerpt, remarkColumns, remarkAlerts, remarkToc]}
        rehypePlugins={[rehypeSlug, rehypeTableSpans, [rehypeHighlight, { detect: false }]]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
