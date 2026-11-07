import { describe, expect, it } from "vitest";
import { isMarkdownFileName, parseMarkdownFile, validateImportSelection } from "./markdownImport";

// 백엔드 MarkdownImportService.parse와 같은 규칙이어야 목업/백엔드 모드의 제목이 갈리지 않는다.
describe("parseMarkdownFile", () => {
  it("앞머리 title이 제목이 되고 앞머리는 본문에서 빠진다", () => {
    expect(parseMarkdownFile("a.md", '---\ntitle: "앞머리 제목"\ntags: [x]\n---\n\n본문 A\n')).toEqual({
      title: "앞머리 제목",
      body: "본문 A\n",
      relativeImages: 0,
    });
  });

  it("맨 앞 # 줄이 제목이 되고 BOM·CRLF를 정리한다", () => {
    const parsed = parseMarkdownFile("b.md", "﻿# 제목 줄 #\r\n\r\n본문 **B**\r\n");
    expect(parsed.title).toBe("제목 줄");
    expect(parsed.body).toBe("본문 **B**\n");
  });

  it("제목 줄이 없으면 파일 이름, 둘째 수준 제목은 제목으로 쓰지 않는다", () => {
    expect(parseMarkdownFile("설치 안내.markdown", "그냥 본문").title).toBe("설치 안내");
    expect(parseMarkdownFile("x.md", "## 둘째\n본문").title).toBe("x");
    expect(parseMarkdownFile(".md", "").title).toBe("제목 없음");
    expect(parseMarkdownFile("x.md", `# ${"가".repeat(300)}`).title).toHaveLength(255);
  });

  it("상대 경로 이미지만 센다", () => {
    const parsed = parseMarkdownFile(
      "img.md",
      "![a](./images/a.png)\n![b](https://example.com/b.png)\n![c](<img/c d.png>)\n![d](/api/wiki/attachments/1/inline)\n",
    );
    expect(parsed.relativeImages).toBe(2);
  });

  it("확장자 판정", () => {
    expect(isMarkdownFileName("A.MD")).toBe(true);
    expect(isMarkdownFileName("a.markdown")).toBe(true);
    expect(isMarkdownFileName("a.txt")).toBe(false);
  });
});

describe("validateImportSelection", () => {
  it("백엔드 모드는 .md 여러 개 또는 zip 하나를 받는다", () => {
    expect(validateImportSelection(["a.md", "b.markdown"], true)).toBeNull();
    expect(validateImportSelection(["docs.zip"], true)).toBeNull();
    expect(validateImportSelection(["docs.zip", "a.md"], true)).toBe(
      "zip 파일은 한 번에 하나만, 다른 파일 없이 가져올 수 있습니다",
    );
    expect(validateImportSelection(["a.png"], true)).toBe(
      "Markdown 파일(.md, .markdown) 또는 zip만 가져올 수 있습니다: a.png",
    );
  });

  it("목업 모드는 zip을 받지 않는다", () => {
    expect(validateImportSelection(["docs.zip"], false)).toBe(
      "Markdown 파일(.md, .markdown)만 가져올 수 있습니다: docs.zip",
    );
    expect(validateImportSelection(Array.from({ length: 21 }, (_, i) => `${i}.md`), false)).toBe(
      "한 번에 20개까지 가져올 수 있습니다",
    );
    expect(validateImportSelection([], false)).toBeNull();
  });
});
