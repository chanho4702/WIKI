import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * `//` 날짜 삽입 캘린더 — SuggestionPopup과 같은 고정 위치·뷰포트 clamp 규약.
 * 의존성 없는 월 그리드(순수 Date 계산)로, 오늘 강조·이전/다음 달 이동·클릭 삽입만 담당한다.
 */

export interface DatePickerAnchor {
  top: number;
  bottom: number;
  left: number;
}

const GAP = 4;
const MARGIN = 8;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 해당 월의 캘린더 그리드 — 앞뒤 빈 칸은 null. 주 단위(7칸)로 자른다. */
export function buildMonthGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface DatePickerPopupProps {
  anchor: DatePickerAnchor;
  onPick: (isoDate: string) => void;
}

export function DatePickerPopup({ anchor, onPick }: DatePickerPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + GAP });

  // SuggestionPopup과 같은 뷰포트 충돌 보정 — 문서 하단에서 캘린더가 잘리지 않게
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    let top = anchor.bottom + GAP;
    if (top + height > vh - MARGIN) {
      const above = anchor.top - GAP - height;
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - MARGIN - height);
    }
    const left = Math.max(MARGIN, Math.min(anchor.left, vw - MARGIN - width));
    setPos((prev) => (prev.top === top && prev.left === left ? prev : { top, left }));
  }, [anchor.top, anchor.bottom, anchor.left, year, month]);

  const moveMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  const isToday = (day: number) =>
    year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

  return (
    <div
      ref={ref}
      className="date-picker-popup"
      role="dialog"
      aria-label="날짜 선택"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="date-picker-header">
        {/* onMouseDown preventDefault — 에디터 선택이 blur로 풀리지 않게(SuggestionPopup 규약) */}
        <button
          type="button"
          aria-label="이전 달"
          onMouseDown={(e) => {
            e.preventDefault();
            moveMonth(-1);
          }}
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
        <span className="date-picker-title">{`${year}년 ${month + 1}월`}</span>
        <button
          type="button"
          aria-label="다음 달"
          onMouseDown={(e) => {
            e.preventDefault();
            moveMonth(1);
          }}
        >
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>
      <table className="date-picker-grid">
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buildMonthGrid(year, month).map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => (
                <td key={di}>
                  {day !== null ? (
                    <button
                      type="button"
                      className={isToday(day) ? "date-picker-day date-picker-day--today" : "date-picker-day"}
                      aria-label={`${year}년 ${month + 1}월 ${day}일 삽입`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onPick(toIsoDate(year, month, day));
                      }}
                    >
                      {day}
                    </button>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="date-picker-hint">Enter = 오늘 날짜 · Esc = 닫기</p>
    </div>
  );
}
