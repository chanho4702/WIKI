import { describe, expect, it } from "vitest";
import {
  RECENTLY_UPDATED_DEFAULT,
  RECENTLY_UPDATED_MAX,
  parseRecentlyUpdatedLimit,
} from "./remarkContentMacros";

describe("parseRecentlyUpdatedLimit", () => {
  it("숫자를 그대로 쓴다", () => {
    expect(parseRecentlyUpdatedLimit("7")).toBe(7);
  });

  it("없거나 숫자가 아니면 기본값이다", () => {
    expect(parseRecentlyUpdatedLimit(undefined)).toBe(RECENTLY_UPDATED_DEFAULT);
    expect(parseRecentlyUpdatedLimit("많이")).toBe(RECENTLY_UPDATED_DEFAULT);
  });

  it("상한과 하한으로 자른다 — 매크로가 목록 화면을 대신하지 않게 한다", () => {
    expect(parseRecentlyUpdatedLimit("999")).toBe(RECENTLY_UPDATED_MAX);
    expect(parseRecentlyUpdatedLimit("0")).toBe(1);
    expect(parseRecentlyUpdatedLimit("-3")).toBe(1);
  });
});
