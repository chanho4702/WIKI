import { describe, expect, it } from "vitest";
import type { Blockquote, Paragraph, PhrasingContent, Root, Text } from "mdast";
import { remarkAlerts } from "./remarkAlerts";

/** 텍스트 노드 헬퍼 */
const text = (value: string): Text => ({ type: "text", value });

/** 단일 텍스트 문단으로 구성된 blockquote 헬퍼 */
const quoteOf = (...paragraphs: PhrasingContent[][]): Blockquote => ({
  type: "blockquote",
  children: paragraphs.map((children): Paragraph => ({ type: "paragraph", children })),
});

const rootOf = (blockquote: Blockquote): Root => ({ type: "root", children: [blockquote] });

/** 플러그인 실행 헬퍼 — remarkAlerts()는 () => (tree) => void 형태의 unified 플러그인 */
const run = (tree: Root) => {
  remarkAlerts()(tree);
};

describe("remarkAlerts", () => {
  const TYPES: Array<{ marker: string; className: string; label: string }> = [
    { marker: "NOTE", className: "md-alert-note", label: "노트" },
    { marker: "TIP", className: "md-alert-tip", label: "팁" },
    { marker: "IMPORTANT", className: "md-alert-important", label: "중요" },
    { marker: "WARNING", className: "md-alert-warning", label: "경고" },
    { marker: "CAUTION", className: "md-alert-caution", label: "주의" },
  ];

  it.each(TYPES)("[!$marker]는 md-alert-$className div로 변환된다", ({ marker, className, label }) => {
    const blockquote = quoteOf([text(`[!${marker}] 내용`)]);
    const tree = rootOf(blockquote);
    run(tree);

    expect(blockquote.data?.hName).toBe("div");
    expect(blockquote.data?.hProperties).toEqual({ className: ["md-alert", className] });

    // 라벨 노드가 콘텐츠 앞에 삽입된다
    const [labelNode, contentNode] = blockquote.children as Paragraph[];
    expect((labelNode.children[0] as Text).value).toBe(label);
    expect((contentNode.children[0] as Text).value).toBe("내용");
  });

  it("마커가 없는 일반 인용구는 건드리지 않는다", () => {
    const blockquote = quoteOf([text("그냥 인용문입니다.")]);
    const tree = rootOf(blockquote);
    run(tree);

    expect(blockquote.data).toBeUndefined();
    expect(blockquote.children).toHaveLength(1);
    expect(((blockquote.children[0] as Paragraph).children[0] as Text).value).toBe("그냥 인용문입니다.");
  });

  it("소문자나 알 수 없는 타입([!info] 등)은 변환하지 않는다", () => {
    const blockquote = quoteOf([text("[!info] 소문자는 마커가 아니다")]);
    const tree = rootOf(blockquote);
    run(tree);

    expect(blockquote.data).toBeUndefined();
  });

  it("마커 뒤 여러 문단의 콘텐츠를 보존한다", () => {
    const blockquote = quoteOf(
      [text("[!WARNING] 첫 줄")],
      [text("둘째 문단")],
    );
    const tree = rootOf(blockquote);
    run(tree);

    expect(blockquote.children).toHaveLength(3); // 라벨 + 첫 문단(마커 제거) + 둘째 문단
    const [, firstParagraph, secondParagraph] = blockquote.children as Paragraph[];
    expect((firstParagraph.children[0] as Text).value).toBe("첫 줄");
    expect((secondParagraph.children[0] as Text).value).toBe("둘째 문단");
  });

  it("마커만 있고 같은 줄에 텍스트가 없으면 첫 문단이 사라지고 라벨만 남는다", () => {
    const blockquote = quoteOf([text("[!NOTE]")]);
    const tree = rootOf(blockquote);
    run(tree);

    expect(blockquote.children).toHaveLength(1);
    expect(((blockquote.children[0] as Paragraph).children[0] as Text).value).toBe("노트");
  });

  it("마커 뒤 같은 줄의 인라인 서식(굵게 등)을 보존한다", () => {
    const blockquote = quoteOf([
      text("[!TIP] "),
      { type: "strong", children: [text("굵게")] },
    ]);
    const tree = rootOf(blockquote);
    run(tree);

    const [, contentParagraph] = blockquote.children as Paragraph[];
    // 마커 텍스트 노드가 통째로 사라지고 굵게 노드만 남는다
    expect(contentParagraph.children).toHaveLength(1);
    expect(contentParagraph.children[0].type).toBe("strong");
  });

  it("blockquote의 첫 자식이 paragraph가 아니면 건드리지 않는다", () => {
    const blockquote: Blockquote = {
      type: "blockquote",
      children: [{ type: "code", lang: null, value: "[!NOTE] 코드블록" }],
    };
    const tree = rootOf(blockquote);
    run(tree);

    expect(blockquote.data).toBeUndefined();
  });
});
