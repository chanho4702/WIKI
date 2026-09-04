import { useEffect, useState } from "react";

/**
 * Mermaid 다이어그램 보기 렌더(W27-2) — `mermaid` 코드 블록을 SVG로 그린다.
 * 자리표시 div로 바꾸는 쪽은 `lib/rehypeMermaid.ts`.
 *
 * 편집 화면은 그대로 코드 블록이다 — 문법을 고칠 수 있어야 하고, 목차·패널과 같은
 * "편집은 마커, 보기는 렌더" 정책이다.
 */

/** mermaid 번들은 수백 KB다 — 다이어그램이 실제로 있는 문서에서만 받아온다(지연 로드). */
let pending: Promise<typeof import("mermaid")> | null = null;
function loadMermaid(): Promise<typeof import("mermaid")> {
  pending ??= import("mermaid");
  return pending;
}

/** mermaid.render는 전역 유일 id를 요구한다 — 한 문서에 여러 다이어그램이 있을 수 있다. */
let seq = 0;

function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

type State =
  | { kind: "loading" }
  | { kind: "ok"; svg: string }
  | { kind: "error"; message: string };

export function MermaidDiagram({ code }: { code: string }) {
  const [dark, setDark] = useState(isDarkTheme);
  const [state, setState] = useState<State>({ kind: "loading" });

  // 테마를 바꾸면 이미 그려진 SVG의 색을 CSS로 덮을 수 없다(mermaid가 인라인 속성으로 칠한다) —
  // 다이어그램을 다시 그리는 수밖에 없어서 루트의 data-theme을 지켜본다.
  useEffect(() => {
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(() => setDark(isDarkTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const { default: mermaid } = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "default",
          // 문서 본문에서 온 텍스트라 라벨의 HTML을 신뢰하지 않는다 — 보기 렌더의 raw HTML 금지 정책과 같은 선.
          securityLevel: "strict",
          // 문법 오류를 mermaid가 document.body에 직접 그리지 않게 한다 — 폴백은 아래에서 우리가 그린다.
          suppressErrorRendering: true,
        });
        const { svg } = await mermaid.render(`wiki-mermaid-${(seq += 1)}`, code);
        if (!cancelled) setState({ kind: "ok", svg });
      } catch (e) {
        if (!cancelled) {
          setState({ kind: "error", message: e instanceof Error ? e.message : "다이어그램을 그리지 못했습니다" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, dark]);

  if (state.kind === "loading") {
    return (
      <div className="md-mermaid" role="status">
        다이어그램 그리는 중…
      </div>
    );
  }
  if (state.kind === "error") {
    // 문법 오류로 그림이 안 나오면 원문이라도 읽을 수 있어야 한다 — 코드 블록으로 되돌린다
    return (
      <div className="md-mermaid is-broken">
        <p className="md-mermaid-error">Mermaid 다이어그램을 그리지 못했습니다: {state.message}</p>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  return (
    <div
      className="md-mermaid"
      // mermaid가 만든 SVG 문자열이다. 문서 본문의 생 HTML을 렌더하는 것이 아니라
      // securityLevel:"strict"로 라벨까지 이스케이프한 라이브러리 출력이라 주입 경로가 아니다.
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
