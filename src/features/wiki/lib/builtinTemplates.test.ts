import { describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATES, builtinTemplatesFor, isBuiltinTemplateId } from "./builtinTemplates";
import { applyTemplateVariables } from "./templateVariables";
import { parseMarkdown, serializeMarkdown } from "../editor/markdown";

/**
 * 편집기 왕복 뒤에도 의미가 남는지 볼 때 허용하는 차이 — 전부 tiptap-markdown 직렬화 방언이다.
 *
 * - `\[` `\]` `\:` : 지시자·패널 마커에 붙는 이스케이프. 보기 렌더러가 이 형태도 읽는다
 *   (MarkdownView.status.test.tsx "편집기가 이스케이프한 인라인 지시자도 읽는다").
 * - 빈 줄: 체크박스 목록은 loose list로, `:::details` 안은 tight로 다시 쓰인다.
 */
const semantic = (md: string) => md.replace(/\\([[\]:])/g, "$1").replace(/\n{2,}/g, "\n").trim();

describe("기본 템플릿 정의", () => {
  it("10종이다", () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(10);
  });

  it("id는 builtin: 접두어이고 서로 다르다", () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.id);
    expect(ids.every(isBuiltinTemplateId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("이름·설명·아이콘·본문이 모두 있다", () => {
    for (const template of BUILTIN_TEMPLATES) {
      expect(template.name.trim()).not.toBe("");
      expect(template.description.trim()).not.toBe("");
      expect([...template.icon]).toHaveLength(1);
      expect(template.content.trim()).not.toBe("");
    }
  });

  /** 이름이 겹치면 고르는 화면에서 어느 쪽인지 구분할 수 없다. */
  it("이름이 서로 다르다", () => {
    const names = BUILTIN_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  /** 제목은 만드는 시점에 "제목 없음"이라 치환할 값이 없다 — 본문에 넣지 않는다. */
  it("본문에는 date·author·space 변수만 쓴다", () => {
    for (const template of BUILTIN_TEMPLATES) {
      const used = [...template.content.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]);
      expect(used.filter((name) => !["date", "author", "space"].includes(name))).toEqual([]);
    }
  });

  it("적어도 한 곳에서 날짜와 작성자를 쓴다", () => {
    for (const template of BUILTIN_TEMPLATES) {
      expect(template.content).toContain("{{date}}");
      expect(template.content).toContain("{{author}}");
    }
  });
});

describe("기본 템플릿 본문 왕복(마크다운 → 에디터 → 마크다운)", () => {
  it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t.content] as const))("%s", (_name, content) => {
    const out = serializeMarkdown(parseMarkdown(content));
    expect(semantic(out)).toBe(semantic(content));
  });

  /** 두 번째 왕복부터는 글자 그대로 고정점이어야 한다 — 저장할 때마다 본문이 흔들리면 안 된다. */
  it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t.content] as const))(
    "%s — 두 번째 왕복은 고정점",
    (_name, content) => {
      const once = serializeMarkdown(parseMarkdown(content));
      expect(serializeMarkdown(parseMarkdown(once))).toBe(once);
    },
  );

  /** 치환된 본문도 같은 문서다 — 변수 자리에 값이 들어갔다고 표가 깨지면 안 된다. */
  it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t.content] as const))(
    "%s — 변수 치환 뒤에도 왕복한다",
    (_name, content) => {
      const applied = applyTemplateVariables(content, {
        date: "2026-09-04",
        author: "김철수",
        space: "개발 위키",
      });
      expect(applied).not.toContain("{{");
      const out = serializeMarkdown(parseMarkdown(applied));
      expect(semantic(out)).toBe(semantic(applied));
    },
  );
});

describe("builtinTemplatesFor", () => {
  it("현재 스페이스를 붙인 PageTemplate 모양으로 준다", () => {
    const list = builtinTemplatesFor("sp1");

    expect(list).toHaveLength(BUILTIN_TEMPLATES.length);
    expect(list.every((t) => t.spaceId === "sp1")).toBe(true);
    expect(list.every((t) => t.updatedAt === null)).toBe(true);
  });
});
