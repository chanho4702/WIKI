import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown";

const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();
const roundtrip = (md: string) => normalize(serializeMarkdown(parseMarkdown(md)));

/** 글자색·배경색 저장 문법(`:c[..]{.red}` / `:bg[..]{.yellow}`) — textColors.ts 결정 근거. */
describe("글자색·배경색 — 마크다운 왕복", () => {
  it("글자색이 문자 단위로 보존된다", () => {
    const md = "이건 :c[중요한 내용]{.red} 입니다";
    expect(roundtrip(md)).toBe(md);
  });

  it("배경색이 보존된다", () => {
    const md = ":bg[형광펜 강조]{.yellow} 문장";
    expect(roundtrip(md)).toBe(md);
  });

  it("색 안의 중첩 마크(굵게)가 살아남고, 한 번 저장 후 안정된다", () => {
    // 직렬화는 겹치는 마크를 유효한 형태로 재배치할 수 있다(굵게가 색 밖으로) — 문자 동일이
    // 아니라 "굵게·색이 모두 보존되고 재직렬화가 안정"이 계약이다.
    const md = ":c[**굵고 붉은** 텍스트]{.red}";
    const once = roundtrip(md);
    expect(once).toContain("**");
    expect(once).toContain("{.red}");
    const doc = parseMarkdown(once);
    const json = JSON.stringify(doc);
    expect(json).toContain('"bold"');
    expect(json).toContain('"textColor"');
    expect(roundtrip(once)).toBe(once);
  });

  it("파싱 결과에 마크가 붙는다", () => {
    const doc = parseMarkdown(":c[중요]{.red}");
    const json = JSON.stringify(doc);
    expect(json).toContain('"textColor"');
    expect(json).toContain('"color":"red"');
  });

  it("팔레트 밖 색 이름은 문법으로 해석하지 않는다(내용 보존)", () => {
    const md = ":c[내용]{.hotpink}";
    const doc = parseMarkdown(md);
    expect(JSON.stringify(doc)).not.toContain('"textColor"');
    // 일반 텍스트로 남는다 — 대괄호 이스케이프 정규화는 허용, 재직렬화는 안정
    const once = roundtrip(md);
    expect(once).toContain("hotpink");
    expect(roundtrip(once)).toBe(once);
  });

  it("글자색+배경색이 같은 구간에 겹칠 수 있다", () => {
    const md = ":c[:bg[겹침]{.yellow}]{.red}";
    const doc = parseMarkdown(md);
    const json = JSON.stringify(doc);
    expect(json).toContain('"textColor"');
    expect(json).toContain('"bgColor"');
  });
});
