import { describe, expect, it } from "vitest";
// node:fs 대신 Vite의 ?raw 쿼리로 CSS 소스를 문자열로 가져온다 — App.w5-width.test.tsx와 동일 패턴.
import css from "./app.css?raw";

// Task 4(W7): DS(@chanho/tokens)에 존재하지 않는 `--color-*` 폴백 패밀리(비-chanho 접두사)와
// hljs raw hex를 라이트/다크 변수(--wiki-*)로 승격했는지 — 스냅샷이 아닌 소스 검사로 회귀를 막는다.
describe("Task 4 다크모드 색상 정비 (CSS 소스 검사)", () => {
  it("존재하지 않는 --color-* 변수 참조가 남아있지 않다", () => {
    // @chanho/tokens 커스텀 프로퍼티는 전부 --chanho- 접두사를 쓴다(tokens.css 확인).
    // 그 외의 --color-* 참조는 전부 이번 정비 대상이었던 유령 폴백이다.
    const ghostColorVarRefs = css.match(/var\(--color-(?!chanho)[a-z-]+/g);
    expect(ghostColorVarRefs).toBeNull();
  });

  it(":root에 --wiki-* 라이트 변수 블록이 정의되어 있다", () => {
    const rootMatch = /(?:^|\n):root\s*\{([^}]*)\}/.exec(css);
    expect(rootMatch).not.toBeNull();
    const rootBlock = rootMatch![1];
    expect(rootBlock).toContain("--wiki-text-subtlest:");
    expect(rootBlock).toContain("--wiki-chip-accent-blue-subtle-bg:");
    expect(rootBlock).toContain("--wiki-chip-accent-blue-text:");
    expect(rootBlock).toContain("--wiki-chip-accent-red-subtle-bg:");
    expect(rootBlock).toContain("--wiki-chip-accent-red-text:");
    expect(rootBlock).toContain("--wiki-hljs-keyword:");
    expect(rootBlock).toContain("--wiki-hljs-string:");
    expect(rootBlock).toContain("--wiki-hljs-number:");
    expect(rootBlock).toContain("--wiki-hljs-comment:");
    expect(rootBlock).toContain("--wiki-hljs-title:");
  });

  it('[data-theme="dark"]가 같은 --wiki-* 변수를 전부 재정의한다 (theme.ts의 실제 스위치 셀렉터)', () => {
    const darkMatch = /(?:^|\n)\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css);
    expect(darkMatch).not.toBeNull();
    const darkBlock = darkMatch![1];
    for (const name of [
      "--wiki-text-subtlest",
      "--wiki-chip-accent-blue-subtle-bg",
      "--wiki-chip-accent-blue-text",
      "--wiki-chip-accent-red-subtle-bg",
      "--wiki-chip-accent-red-text",
      "--wiki-hljs-keyword",
      "--wiki-hljs-string",
      "--wiki-hljs-number",
      "--wiki-hljs-comment",
      "--wiki-hljs-title",
    ]) {
      expect(darkBlock).toContain(`${name}:`);
    }
  });

  it("hljs 규칙이 raw hex 대신 --wiki-hljs-* 변수를 참조한다", () => {
    const hljsBlockMatch = /\/\* highlight\.js[^]*?(?=\n\/\* [^h]|\n\.markdown-body table)/.exec(
      css,
    );
    expect(hljsBlockMatch).not.toBeNull();
    const hljsBlock = hljsBlockMatch![0];
    expect(hljsBlock).not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(hljsBlock).toContain("var(--wiki-hljs-keyword)");
    expect(hljsBlock).toContain("var(--wiki-hljs-string)");
    expect(hljsBlock).toContain("var(--wiki-hljs-number)");
    expect(hljsBlock).toContain("var(--wiki-hljs-comment)");
    expect(hljsBlock).toContain("var(--wiki-hljs-title)");
  });

  it("드래그 핸들 SVG는 다크 테마 전용 override를 가진다", () => {
    expect(css).toMatch(/\[data-theme="dark"\]\s+\.drag-handle\s*\{/);
  });
});
