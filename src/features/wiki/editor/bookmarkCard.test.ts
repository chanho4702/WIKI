import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown";

describe("bookmarkCard — 링크 미리보기 카드 왕복", () => {
  it("`::bookmark{...}` 한 줄이 카드 노드로 파싱되고 그대로 직렬화된다", () => {
    const md = '::bookmark{url="https://example.com/docs" title="예제 문서"}\n';
    const doc = parseMarkdown(md);
    const card = doc.content?.find((n) => n.type === "bookmarkCard");
    expect(card?.attrs).toMatchObject({ url: "https://example.com/docs", title: "예제 문서" });
    const round = serializeMarkdown(doc);
    expect(round.trim()).toBe('::bookmark{url="https://example.com/docs" title="예제 문서"}');
    expect(serializeMarkdown(parseMarkdown(round))).toBe(round);
  });

  it("문단 중간의 ::bookmark는 일반 텍스트로 남는다", () => {
    const doc = parseMarkdown('앞 문장 ::bookmark{url="https://x"} 뒤 문장\n');
    expect(doc.content?.some((n) => n.type === "bookmarkCard")).toBe(false);
  });

  it("title의 따옴표는 저장 시 제거된다(속성 문법 보호)", () => {
    const doc = parseMarkdown('::bookmark{url="https://x" title="제목"}\n');
    const card = doc.content!.find((n) => n.type === "bookmarkCard")!;
    card.attrs = { ...card.attrs, title: '위험한 " 제목' };
    expect(serializeMarkdown(doc)).toContain('title="위험한  제목"');
  });
});
