import { describe, expect, it } from "vitest";
import { relativeTime } from "./relativeTime";

const NOW = new Date("2026-07-22T12:00:00.000Z").getTime();

describe("relativeTime", () => {
  it("빈 값/무효 날짜는 빈 문자열", () => {
    expect(relativeTime("")).toBe("");
    expect(relativeTime("nope")).toBe("");
  });

  it("1분 미만은 '방금 전'", () => {
    expect(relativeTime("2026-07-22T11:59:30.000Z", NOW)).toBe("방금 전");
  });

  it("분/시간/일 단위로 표기한다", () => {
    expect(relativeTime("2026-07-22T11:30:00.000Z", NOW)).toBe("30분 전");
    expect(relativeTime("2026-07-22T09:00:00.000Z", NOW)).toBe("3시간 전");
    expect(relativeTime("2026-07-20T12:00:00.000Z", NOW)).toBe("2일 전");
  });

  it("7일 이상은 절대일자로 폴백한다", () => {
    expect(relativeTime("2026-07-01T12:00:00.000Z", NOW)).toMatch(/2026년 7월 1일/);
  });

  it("미래 시각은 절대일자로 폴백한다", () => {
    expect(relativeTime("2026-07-25T12:00:00.000Z", NOW)).toMatch(/2026년 7월 25일/);
  });
});
