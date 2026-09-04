import { useEffect, useRef, useState } from "react";
import { Compass, FileText, Folder } from "lucide-react";
import type { Space } from "../store/types";
import type { StarredPageEntry } from "../lib/starredPages";
import { contentPathIn } from "../lib/contentPath";
import { TruncatedText } from "./TruncatedText";

export interface StarredFlyoutProps {
  /** 전체 스페이스 — 별표된 것만 이 컴포넌트가 걸러낸다. */
  spaces: Space[];
  starredSpaceIds: string[];
  starredPages: StarredPageEntry[];
  /** 항목 클릭 — 해당 경로로 이동. 패널을 닫는 것은 호출 측(GlobalSidebar) 책임이다. */
  onNavigate: (path: string) => void;
}

/**
 * 글로벌 네비 "별표 표시"를 누르면 열리는 검색형 플라이아웃 (컨플루언스 참조 —
 * 펼침 목록이 아니라 검색해서 찾는 시스템). SpaceFlyout과 같은 패턴: 마운트 = 열림,
 * 열릴 때 검색 입력 포커스, 외부 클릭/Escape 닫기는 호출 측의 useDismissablePopover가 담당.
 *
 * 페이지 별표는 별표 시점 스냅샷(starredPages.ts v2)이라 다른 스페이스의 제목도 안다.
 * 구버전(제목 없는) 엔트리는 해당 스페이스를 방문해야 hydrate되므로 여기선 걸러낸다.
 */
export function StarredFlyout({ spaces, starredSpaceIds, starredPages, onNavigate }: StarredFlyoutProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const spaceList = spaces.filter(
    (s) =>
      starredSpaceIds.includes(s.id) &&
      (!q || s.name.toLowerCase().includes(q) || s.key.toLowerCase().includes(q)),
  );
  const pageList = starredPages.filter(
    (p) => p.spaceId !== "" && p.title !== "" && (!q || p.title.toLowerCase().includes(q)),
  );
  const empty = spaceList.length === 0 && pageList.length === 0;

  return (
    <div className="space-flyout starred-flyout" role="dialog" aria-label="별표 표시">
      <input
        ref={inputRef}
        type="search"
        className="space-flyout-filter"
        placeholder="별표 항목 검색"
        aria-label="별표 항목 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {empty ? (
        <p className="starred-flyout-empty">
          {q
            ? "검색 결과가 없습니다"
            : "스페이스·페이지의 별표(★)를 누르면 여기에 모입니다"}
        </p>
      ) : (
        <>
          {spaceList.length > 0 && (
            <section aria-label="별표 표시된 스페이스">
              <h4 className="space-flyout-section-title">스페이스</h4>
              <ul className="space-flyout-list">
                {spaceList.map((s) => (
                  <li key={s.id} className="space-flyout-item">
                    <button
                      type="button"
                      tabIndex={-1}
                      className="space-flyout-item-name"
                      onClick={() => onNavigate(`/spaces/${s.id}`)}
                    >
                      <Compass size={14} aria-hidden="true" />
                      <TruncatedText text={`${s.name} (${s.key})`} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {pageList.length > 0 && (
            <section aria-label="별표 표시된 페이지">
              <h4 className="space-flyout-section-title">페이지</h4>
              <ul className="space-flyout-list">
                {pageList.map((p) => (
                  <li key={p.id} className="space-flyout-item">
                    <button
                      type="button"
                      tabIndex={-1}
                      className="space-flyout-item-name"
                      onClick={() =>
                        onNavigate(contentPathIn(p.spaceId, { id: p.id, type: p.type ?? "page" }))
                      }
                    >
                      {/* 이모지 아이콘이 있으면 문서 아이콘 대신 이모지(트리와 같은 규칙) */}
                      {p.icon ? (
                        <span className="page-tree-emoji" aria-hidden="true">
                          {p.icon}
                        </span>
                      ) : p.type === "folder" ? (
                        <Folder size={14} aria-hidden="true" />
                      ) : (
                        <FileText size={14} aria-hidden="true" />
                      )}
                      <TruncatedText text={p.title} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
