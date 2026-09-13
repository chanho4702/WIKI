import { common } from "lowlight";
import { describe, expect, it } from "vitest";
import { CODE_LANGUAGES } from "./codeLanguages";

describe("CODE_LANGUAGES — 코드 블록 언어 목록의 단일 원천", () => {
  it("중복이 없다 — plaintext는 손으로 넣은 것과 lowlight common 양쪽에 있어 한 번만 남아야 한다", () => {
    expect(new Set(CODE_LANGUAGES).size).toBe(CODE_LANGUAGES.length);
    expect(CODE_LANGUAGES.filter((lang) => lang === "plaintext")).toHaveLength(1);
  });

  it("plaintext·mermaid가 맨 앞에 고정되고 나머지는 lowlight common 전부다", () => {
    expect(CODE_LANGUAGES.slice(0, 2)).toEqual(["plaintext", "mermaid"]);
    for (const lang of Object.keys(common)) expect(CODE_LANGUAGES).toContain(lang);
    expect(CODE_LANGUAGES).toHaveLength(2 + Object.keys(common).length - ("plaintext" in common ? 1 : 0));
  });
});
