import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { ReactNode } from "react";
import { getPage, lookupPagesByTitle } from "../store/wikiStore";
import { extractExcerpt } from "../lib/excerpt";
import { contentPathIn } from "../lib/contentPath";

/**
 * `::excerpt-include[제목]` 렌더(W23) — 같은 스페이스에서 제목으로 문서를 찾아 그 문서의
 * `:::excerpt` 부분을 가져온다.
 *
 * 제목으로 찾는 이유: 이 위키의 내부 링크(`[[제목]]`)가 제목으로 해석되므로 같은 규칙을 따른다.
 * 발췌 블록이 없는 문서는 첫 문단으로 대신하지 않는다 — 작성자가 "가져다 써도 되는 부분"을
 * 정하지 않은 문서라, 그 사실을 알리고 링크만 준다.
 *
 * 한 단계만 따라간다. 발췌 안의 `::excerpt-include`는 마커 텍스트로 남긴다 — 서로를 포함하는
 * 두 문서가 무한히 펼쳐지는 것을 막는다.
 */
export function ExcerptInclude({
  title,
  spaceId,
  render,
}: {
  title: string;
  spaceId: string;
  /** 발췌 본문을 그릴 렌더러 — MarkdownView 자신을 넘긴다(순환 import을 피한다). */
  render: (markdown: string) => ReactNode;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "missing" }
    | { kind: "no-excerpt"; pageId: string; type: "page" | "folder" }
    | { kind: "ok"; pageId: string; type: "page" | "folder"; excerpt: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [node] = await lookupPagesByTitle(spaceId, [title]);
        if (!node) {
          if (!cancelled) setState({ kind: "missing" });
          return;
        }
        const page = await getPage(node.id);
        if (cancelled) return;
        const excerpt = page ? extractExcerpt(page.body) : null;
        setState(
          excerpt === null
            ? { kind: "no-excerpt", pageId: node.id, type: node.type }
            : { kind: "ok", pageId: node.id, type: node.type, excerpt },
        );
      } catch {
        if (!cancelled) setState({ kind: "missing" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId, title]);

  if (state.kind === "loading") {
    return <div className="md-excerpt-include" role="status">발췌 불러오는 중…</div>;
  }
  if (state.kind === "missing") {
    return (
      <div className="md-excerpt-include is-broken">
        <span className="md-excerpt-include-head">발췌 포함: “{title}” 문서를 찾을 수 없습니다</span>
      </div>
    );
  }
  const link = contentPathIn(spaceId, { id: state.pageId, type: state.type });
  if (state.kind === "no-excerpt") {
    return (
      <div className="md-excerpt-include is-broken">
        <span className="md-excerpt-include-head">
          <Link to={link}>{title}</Link>에 발췌 블록(<code>:::excerpt</code>)이 없습니다
        </span>
      </div>
    );
  }
  return (
    <aside className="md-excerpt-include" aria-label={`${title} 발췌`}>
      <span className="md-excerpt-include-head">
        <Link to={link}>{title}</Link>에서 발췌
      </span>
      <div className="md-excerpt-include-body">{render(state.excerpt)}</div>
    </aside>
  );
}
