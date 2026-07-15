import { describe, expect, it } from "vitest";
import { lineDiff } from "./lineDiff";

describe("lineDiff", () => {
  it("동일 텍스트는 전부 same", () => {
    expect(lineDiff("a\nb", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
    ]);
  });

  it("빈 문자열 → 내용은 전부 added", () => {
    expect(lineDiff("", "a\nb")).toEqual([
      { kind: "added", text: "a" },
      { kind: "added", text: "b" },
    ]);
  });

  it("내용 → 빈 문자열은 전부 removed", () => {
    expect(lineDiff("a\nb", "")).toEqual([
      { kind: "removed", text: "a" },
      { kind: "removed", text: "b" },
    ]);
  });

  it("중간 라인 교체는 removed가 added보다 먼저 온다", () => {
    expect(lineDiff("a\nx\nb", "a\ny\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "x" },
      { kind: "added", text: "y" },
      { kind: "same", text: "b" },
    ]);
  });

  it("둘 다 빈 문자열이면 빈 배열", () => {
    expect(lineDiff("", "")).toEqual([]);
  });
});
