import { useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { TextArea } from "@chanho/react";
import type { Page } from "../store/types";

export interface WikiLinkTextAreaProps {
  label: string;
  rows: number;
  placeholder?: string;
  value: string;
  onValueChange: (next: string) => void;
  /** 자동완성 후보 — 같은 스페이스의 페이지 목록 */
  pages: Page[];
}

const MAX_SUGGESTIONS = 8;

interface ActiveQuery {
  /** 값 문자열에서 "[[" 가 시작하는 인덱스 */
  start: number;
  query: string;
  /** 감지 시점의 커서 위치 — 삽입 시 교체 구간의 끝 */
  caret: number;
}

/** 커서 앞 텍스트에서 아직 닫히지 않은 [[쿼리 를 찾는다 — 없으면 null */
function activeLinkQuery(text: string, caret: number): ActiveQuery | null {
  const before = text.slice(0, caret);
  const match = /\[\[([^\]\n]*)$/.exec(before);
  if (!match) return null;
  return { start: match.index, query: match[1], caret };
}

/**
 * [[ 자동완성 지원 TextArea.
 * 키 입력은 wrapper의 onKeyDown(버블)에서 처리한다 — 디자인 시스템 TextArea가
 * onKeyDown을 전달하는지에 의존하지 않기 위해서다(버블 단계 preventDefault도 기본동작을 막는다).
 */
export function WikiLinkTextArea({
  label,
  rows,
  placeholder,
  value,
  onValueChange,
  pages,
}: WikiLinkTextAreaProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<ActiveQuery | null>(null);
  const [highlight, setHighlight] = useState(0);

  const suggestions =
    active === null
      ? []
      : pages
          .filter((p) => p.title.toLowerCase().includes(active.query.trim().toLowerCase()))
          .slice(0, MAX_SUGGESTIONS);
  const open = active !== null && suggestions.length > 0;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange(event.target.value);
    setActive(activeLinkQuery(event.target.value, event.target.selectionStart));
    setHighlight(0);
  };

  const insert = (page: Page) => {
    if (!active) return;
    const next = value.slice(0, active.start) + `[[${page.title}]]` + value.slice(active.caret);
    onValueChange(next);
    setActive(null);
    // 커서를 닫는 ]] 뒤로 — 리렌더 후 적용
    const position = active.start + page.title.length + 4;
    requestAnimationFrame(() => {
      const textarea = wrapperRef.current?.querySelector("textarea");
      textarea?.focus();
      textarea?.setSelectionRange(position, position);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      insert(suggestions[highlight]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setActive(null);
    }
  };

  return (
    <div ref={wrapperRef} className="wiki-autocomplete" onKeyDown={handleKeyDown}>
      <TextArea
        label={label}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
      />
      {open ? (
        <ul className="wiki-autocomplete-list" role="listbox" aria-label="페이지 링크 자동완성">
          {suggestions.map((page, index) => (
            <li key={page.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                className="wiki-autocomplete-item"
                // mousedown에서 preventDefault — textarea 포커스를 유지한 채 삽입
                onMouseDown={(event) => {
                  event.preventDefault();
                  insert(page);
                }}
              >
                {page.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
