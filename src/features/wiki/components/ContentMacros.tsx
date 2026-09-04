import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { PageNode } from "../store/types";
import { listPagesWithLabel, listRecentlyUpdated } from "../store/wikiStore";
import { contentPathIn } from "../lib/contentPath";
import { relativeTime } from "../lib/relativeTime";

/**
 * 콘텐츠 매크로 보기 렌더(W27-3) — 지시자를 자리표시 div로 바꾸는 쪽은 `lib/remarkContentMacros.ts`.
 *
 * 조회는 스토어 async 함수 경유다(CLAUDE.md 불변조건 1) — 목업/백엔드 어느 모드에서도 같은 코드다.
 * 로드 실패(권한·503)는 삼키지 않고 그 자리에 문장으로 드러낸다.
 */

/** 라벨 목록 상한 — 그보다 많으면 매크로가 아니라 검색이 맞다(속성 보고서와 같은 기준). */
export const PAGES_BY_LABEL_LIMIT = 50;

interface ListItem {
  id: string;
  title: string;
  type: PageNode["type"];
  updatedAt?: string;
}

/** 목록 한 줄 — 제목 링크 + 수정일. 두 매크로가 같은 모양을 쓴다. */
function MacroList({ spaceId, items }: { spaceId: string; items: ListItem[] }) {
  return (
    <ul className="md-content-macro-list">
      {items.map((item) => (
        <li key={item.id}>
          <Link to={contentPathIn(spaceId, item)}>{item.title}</Link>
          {item.updatedAt ? (
            <time className="md-content-macro-time" dateTime={item.updatedAt}>
              {relativeTime(item.updatedAt)}
            </time>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

type State<T> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; items: T[]; total: number };

/** `::pages-by-label[라벨]` — 같은 스페이스에서 그 라벨이 붙은 문서 목록. */
export function PagesByLabel({ label, spaceId }: { label: string; spaceId: string }) {
  const [state, setState] = useState<State<ListItem>>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const pages = await listPagesWithLabel(spaceId, label);
        if (cancelled) return;
        setState({
          kind: "ok",
          total: pages.length,
          items: pages.slice(0, PAGES_BY_LABEL_LIMIT).map((p) => ({
            id: p.id,
            title: p.title,
            type: p.type,
            updatedAt: p.updatedAt,
          })),
        });
      } catch (e) {
        if (!cancelled) {
          setState({ kind: "error", message: e instanceof Error ? e.message : "문서 목록을 불러오지 못했습니다" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId, label]);

  if (state.kind === "loading") return <div className="md-pages-by-label" role="status">문서 목록 불러오는 중…</div>;
  if (state.kind === "error") return <div className="md-pages-by-label is-broken">라벨별 문서 목록: {state.message}</div>;
  if (state.items.length === 0) {
    return <div className="md-pages-by-label is-empty">“{label}” 라벨이 붙은 문서가 없습니다</div>;
  }
  return (
    <div className="md-pages-by-label">
      <MacroList spaceId={spaceId} items={state.items} />
      {state.total > PAGES_BY_LABEL_LIMIT ? (
        <p className="md-content-macro-note">
          문서 {state.total}건 중 처음 {PAGES_BY_LABEL_LIMIT}건만 보여 줍니다.
        </p>
      ) : null}
    </div>
  );
}

/** `::recently-updated{limit=N}` — 스페이스의 최근 수정 문서. */
export function RecentlyUpdated({ spaceId, limit }: { spaceId: string; limit: number }) {
  const [state, setState] = useState<State<ListItem>>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const nodes = await listRecentlyUpdated(spaceId, limit);
        if (cancelled) return;
        setState({
          kind: "ok",
          total: nodes.length,
          items: nodes.map((n) => ({ id: n.id, title: n.title, type: n.type, updatedAt: n.updatedAt })),
        });
      } catch (e) {
        if (!cancelled) {
          setState({ kind: "error", message: e instanceof Error ? e.message : "최근 업데이트를 불러오지 못했습니다" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId, limit]);

  if (state.kind === "loading") return <div className="md-recently-updated" role="status">최근 업데이트 불러오는 중…</div>;
  if (state.kind === "error") return <div className="md-recently-updated is-broken">최근 업데이트: {state.message}</div>;
  if (state.items.length === 0) {
    return <div className="md-recently-updated is-empty">최근 업데이트된 문서가 없습니다</div>;
  }
  return (
    <div className="md-recently-updated">
      <MacroList spaceId={spaceId} items={state.items} />
    </div>
  );
}
