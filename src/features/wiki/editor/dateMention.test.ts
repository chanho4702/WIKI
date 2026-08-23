import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { DATE_MENTION_NAME, dateFromHref, formatDateLabel } from "./extensions/dateMention";
import { buildMonthGrid, toIsoDate } from "./components/DatePickerPopup";

const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();
const roundtrip = (md: string) => normalize(serializeMarkdown(parseMarkdown(md)));

/** 날짜 요소 저장 문법 `[ISO](date:ISO)` — 멘션과 같은 표준 링크 재사용 원칙. */
describe("날짜 요소 — 마크다운 왕복", () => {
  it("표준 링크 표기가 그대로 보존된다", () => {
    const md = "마감: [2026-08-23](date:2026-08-23) 까지";
    expect(roundtrip(md)).toBe(md);
  });

  it("파싱 결과가 dateMention 원자 노드다", () => {
    const doc = parseMarkdown("[2026-12-25](date:2026-12-25)");
    const json = JSON.stringify(doc);
    expect(json).toContain(`"${DATE_MENTION_NAME}"`);
    expect(json).toContain('"date":"2026-12-25"');
  });

  it("날짜 형식이 아닌 date: href는 승격하지 않는다", () => {
    expect(dateFromHref("date:내일")).toBeNull();
    expect(dateFromHref("date:2026-08-23")).toBe("2026-08-23");
  });

  it("표시 라벨은 한국어 날짜다", () => {
    expect(formatDateLabel("2026-08-05")).toBe("2026년 8월 5일");
    expect(formatDateLabel("깨진값")).toBe("깨진값");
  });
});

describe("캘린더 월 그리드", () => {
  it("2026년 8월은 토요일 시작 31일 — 앞 6칸 공백, 6주", () => {
    const grid = buildMonthGrid(2026, 7); // month 7 = 8월
    expect(grid[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(grid[0][6]).toBe(1);
    expect(grid.flat().filter((d) => d !== null)).toHaveLength(31);
    expect(grid.every((week) => week.length === 7)).toBe(true);
  });

  it("toIsoDate는 0패딩 ISO를 만든다", () => {
    expect(toIsoDate(2026, 0, 3)).toBe("2026-01-03");
  });
});
