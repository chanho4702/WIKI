import { describe, expect, it } from "vitest";
import { compareCommentIds, compareInstants } from "./commentOrder";

describe("compareCommentIds", () => {
  it("숫자 id는 수로 비교한다(백엔드 Long 순서)", () => {
    expect(compareCommentIds("81", "100")).toBeLessThan(0);
    expect(compareCommentIds("100", "99")).toBeGreaterThan(0);
    expect(compareCommentIds("12345678901234567890", "12345678901234567891")).toBeLessThan(0);
    expect(compareCommentIds("7", "7")).toBe(0);
  });

  it("숫자가 아닌 목업 id는 문자열로 비교한다", () => {
    expect(compareCommentIds("cm-001", "cm-002")).toBeLessThan(0);
  });
});

describe("compareInstants", () => {
  it("소수 초 자릿수가 달라도 시간 순서대로 비교한다", () => {
    expect(compareInstants("2026-01-01T00:00:00Z", "2026-01-01T00:00:00.001Z")).toBeLessThan(0);
    expect(compareInstants("2026-01-01T00:00:00.5Z", "2026-01-01T00:00:00.123456Z")).toBeGreaterThan(0);
    // 밀리초 아래(Postgres 마이크로초)도 가른다
    expect(compareInstants("2026-01-01T00:00:00.000001Z", "2026-01-01T00:00:00.000002Z")).toBeLessThan(0);
    expect(compareInstants("2026-01-01T00:00:00.100Z", "2026-01-01T00:00:00.1Z")).toBe(0);
  });
});
