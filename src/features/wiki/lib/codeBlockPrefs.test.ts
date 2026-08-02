import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CODE_BLOCK_PREFS,
  countLines,
  getCodeBlockPrefs,
  setCodeBlockPrefs,
  showsLineNumbers,
} from "./codeBlockPrefs";

describe("코드 블록 표시 설정", () => {
  beforeEach(() => localStorage.clear());

  it("기본값은 줄 번호 켬 · 줄바꿈 끔 — 캡처의 기본 상태다", () => {
    expect(getCodeBlockPrefs()).toEqual({ lineNumbers: true, wrap: false });
    expect(DEFAULT_CODE_BLOCK_PREFS).toEqual({ lineNumbers: true, wrap: false });
  });

  it("저장한 값을 다시 읽는다", () => {
    setCodeBlockPrefs({ lineNumbers: false, wrap: true });
    expect(getCodeBlockPrefs()).toEqual({ lineNumbers: false, wrap: true });
  });

  it("깨진 값은 기본값으로 대체한다 — 편집이 막히면 안 된다", () => {
    localStorage.setItem("wiki.ui.codeBlock", "{ not json");
    expect(getCodeBlockPrefs()).toEqual(DEFAULT_CODE_BLOCK_PREFS);
    localStorage.setItem("wiki.ui.codeBlock", JSON.stringify({ lineNumbers: "네" }));
    expect(getCodeBlockPrefs().lineNumbers).toBe(true);
  });

  it("줄바꿈이 켜지면 줄 번호를 그리지 않는다", () => {
    // 접힌 줄과 번호가 어긋나면 "12번째 줄"이 다른 줄을 가리킨다 — 틀린 번호는 없느니만 못하다
    expect(showsLineNumbers({ lineNumbers: true, wrap: false })).toBe(true);
    expect(showsLineNumbers({ lineNumbers: true, wrap: true })).toBe(false);
    expect(showsLineNumbers({ lineNumbers: false, wrap: false })).toBe(false);
  });
});

describe("줄 수 세기", () => {
  it("빈 코드도 한 줄이다", () => {
    expect(countLines("")).toBe(1);
  });

  it("끝의 개행 하나에는 번호를 붙이지 않는다", () => {
    // 코드블록 텍스트는 보통 개행으로 끝난다 — 그걸 세면 항상 빈 줄 번호가 하나 남는다
    expect(countLines("a\nb\n")).toBe(2);
    expect(countLines("a\nb")).toBe(2);
  });

  it("중간 빈 줄은 센다", () => {
    expect(countLines("a\n\nc")).toBe(3);
  });
});
