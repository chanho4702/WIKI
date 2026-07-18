import { useEffect, useRef, useState } from "react";
import { Button } from "@chanho/react";
import type { Space } from "../store/types";
import { useStarredSpaces } from "../lib/starredSpaces";

export interface SpaceFlyoutProps {
  spaces: Space[];
  currentSpaceId: string;
  /** 항목 클릭 — 해당 스페이스로 이동. 패널을 닫는 것은 호출 측(WikiLayout) 책임이다. */
  onNavigate: (spaceId: string) => void;
  /** 하단 "스페이스 만들기" 클릭 — 기존 SpaceCreateModal을 여는 것은 호출 측 책임이다. */
  onCreateClick: () => void;
}

function matchesQuery(space: Space, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return space.name.toLowerCase().includes(q) || space.key.toLowerCase().includes(q);
}

/**
 * 사이드바 헤더의 스페이스 트리거 버튼을 누르면 열리는 플라이아웃 패널 (W6 T3).
 * 필터 입력 → "현재"/"별표 표시됨"/"모든 스페이스" 섹션 → 하단 "스페이스 만들기".
 * 열릴 때(마운트 시) 필터 입력에 포커스한다 — 이 컴포넌트는 열려 있을 때만 마운트되므로
 * InsertMenu처럼 open prop을 받지 않고 마운트 자체를 신호로 쓴다.
 *
 * 외부 클릭/Escape/Tab-out 닫기는 이 컴포넌트가 아니라 호출 측(WikiLayout)이 트리거+패널을 함께
 * 감싼 영역에 공용 훅(useDismissablePopover.ts)을 붙여 처리한다(W7 T1) — Escape가 컨테이너 전체
 * keydown으로 승격되므로 이 컴포넌트 내부에서 별도로 처리할 필요가 없다(이전엔 필터 input에만
 * 바인딩돼 있어, 별표 버튼 등에 포커스가 가 있으면 Escape가 먹지 않는 갭이 있었다).
 */
export function SpaceFlyout({ spaces, currentSpaceId, onNavigate, onCreateClick }: SpaceFlyoutProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { starred, toggle } = useStarredSpaces();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = spaces.filter((s) => matchesQuery(s, query));
  const current = filtered.find((s) => s.id === currentSpaceId);
  // "별표 표시됨" 섹션은 현재 스페이스를 제외한다 — 현재 스페이스는 "현재" 섹션에서 이미 보인다.
  const starredList = filtered.filter((s) => s.id !== currentSpaceId && starred.includes(s.id));

  const renderItem = (space: Space) => {
    const isStarred = starred.includes(space.id);
    return (
      <li key={space.id} className="space-flyout-item">
        {/* InsertMenu.tsx 관례(W6-T2 확정 패턴) — 항목 버튼은 tabIndex={-1}로 탭 순서에서 뺀다.
         * 필터 입력만 탭 가능하게 두어야 Tab으로 이 버튼들에 진입한 뒤 Escape를 눌러도 안 먹는
         * (포커스가 팝오버 밖 관리 로직 대상이 아닌) 갭이 생기지 않는다(T3 잔여 픽스). */}
        <button
          type="button"
          tabIndex={-1}
          className="space-flyout-item-name"
          onClick={() => onNavigate(space.id)}
        >
          {space.name} ({space.key})
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="space-flyout-star"
          aria-pressed={isStarred}
          aria-label="별표"
          onClick={() => toggle(space.id)}
        >
          {isStarred ? "★" : "☆"}
        </button>
      </li>
    );
  };

  return (
    <div className="space-flyout" role="dialog" aria-label="스페이스 전환">
      <input
        ref={inputRef}
        type="text"
        className="space-flyout-filter"
        placeholder="스페이스 필터"
        aria-label="스페이스 필터"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="space-flyout-empty">일치하는 스페이스가 없습니다</p>
      ) : (
        <>
          {current && (
            <section className="space-flyout-section">
              <h3 className="space-flyout-section-title">현재</h3>
              <ul className="space-flyout-list">{renderItem(current)}</ul>
            </section>
          )}
          {starredList.length > 0 && (
            <section className="space-flyout-section">
              <h3 className="space-flyout-section-title">별표 표시됨</h3>
              <ul className="space-flyout-list">{starredList.map(renderItem)}</ul>
            </section>
          )}
          <section className="space-flyout-section">
            <h3 className="space-flyout-section-title">모든 스페이스</h3>
            <ul className="space-flyout-list">{filtered.map(renderItem)}</ul>
          </section>
        </>
      )}
      {/* InsertMenu.tsx 관례(W6-T2) — 이 버튼도 tabIndex={-1}로 탭 순서에서 뺀다(T3 잔여 픽스) */}
      <Button variant="subtle" tabIndex={-1} className="space-flyout-create" onClick={onCreateClick}>
        스페이스 만들기
      </Button>
    </div>
  );
}
