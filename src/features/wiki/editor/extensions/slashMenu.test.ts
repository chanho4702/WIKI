import { describe, expect, it } from "vitest";
import { SLASH_ITEMS, filterSlashItems, isInsideOpenWikiLink } from "./slashMenu";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "./base";

describe("슬래시 메뉴", () => {
  it("전체 항목 — 화이트리스트 블록과 일치", () => {
    expect(SLASH_ITEMS.map((i) => i.id)).toEqual([
      "h1", "h2", "h3", "bullet", "ordered", "task", "quote",
      "note", "tip", "warning", "caution",
      "code", "divider", "table", "image", "emoji",
    ]);
  });

  it("한글 라벨 필터", () => {
    expect(filterSlashItems("제목").map((i) => i.id)).toEqual(["h1", "h2", "h3"]);
    expect(filterSlashItems("표").map((i) => i.id)).toEqual(["table"]);
  });

  it("전 항목이 비어 있지 않은 설명을 갖는다 — 요소 브라우저(InsertMenu)에 노출", () => {
    for (const item of SLASH_ITEMS) {
      expect(item.description.length).toBeGreaterThan(0);
    }
  });

  it("run(h1)은 현재 블록을 제목1로 바꾼다", () => {
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    SLASH_ITEMS.find((i) => i.id === "h1")!.run(editor);
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("# 본문");
    editor.destroy();
  });

  // W6 T4 — "이모지" 항목은 run(editor)에서 직접 삽입하지 않는다(SlashItem.run은 editor만 받아
  // UI(EmojiPicker 팝오버)를 열 수 없기 때문). action 마커로 구분하고 run은 문서를 바꾸지 않는
  // no-op이어야 한다 — 실제 열기는 호출부(Suggestion command/InsertMenu.select)가 담당한다.
  it("emoji 항목은 action: openEmoji 마커를 갖고, run(editor)은 문서를 바꾸지 않는 no-op이다", () => {
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    const item = SLASH_ITEMS.find((i) => i.id === "emoji")!;
    expect(item.action).toBe("openEmoji");
    item.run(editor);
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("본문");
    editor.destroy();
  });

  // GitHub-style alerts — 저장 문법은 순수 blockquote + [!TYPE] 마커 텍스트뿐이다(신규 노드 타입 없음).
  // tiptap-markdown 직렬화기는 "["를 링크 문법과의 혼동을 막기 위해 "\["로 이스케이프한다 —
  // 저장 문자열에는 백슬래시가 남지만, remark-parse(react-markdown 렌더 경로)는 이를 파싱 시점에
  // 다시 리터럴 "["로 되돌리므로 remarkAlerts 마커 인식에는 영향이 없다 —
  // MarkdownView.test.tsx의 "이스케이프 저장형(\[!NOTE\])도 md-alert-note 패널로 렌더한다" 및
  // "비이스케이프 입력이 에디터 왕복(파싱→직렬화) 후에도 패널로 유지된다" 테스트로 실증했다.
  describe.each([
    { id: "note", marker: "[!NOTE]" },
    { id: "tip", marker: "[!TIP]" },
    { id: "warning", marker: "[!WARNING]" },
    { id: "caution", marker: "[!CAUTION]" },
  ])("run($id)은 blockquote + $marker 마커를 삽입한다", ({ id, marker }) => {
    it("직렬화하면 (이스케이프된) blockquote 마크다운이 된다", () => {
      const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("") });
      SLASH_ITEMS.find((i) => i.id === id)!.run(editor);
      const md = serializeMarkdown(editor.getJSON()).trim();
      const escapedMarker = marker.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
      expect(md).toBe(`> ${escapedMarker}`);
      editor.destroy();
    });
  });

  // 회귀: 리뷰어 Important — [[ 쿼리(공백 허용) 안에 "/"가 오면 wikiLinkSuggestion과
  // slashMenu가 동시에 활성화돼 팝업이 겹쳤다. slashMenu의 allow는 이 함수로 활성화를 거부한다.
  describe("isInsideOpenWikiLink — [[ 쿼리 안에서는 슬래시 메뉴를 막는다", () => {
    it("열린 [[ 런 안(공백 포함)이면 true", () => {
      expect(isInsideOpenWikiLink("[[운영 ")).toBe(true);
      expect(isInsideOpenWikiLink("메모: [[운영 가이드")).toBe(true);
    });

    it("[[가 ]]로 닫혔으면 false", () => {
      expect(isInsideOpenWikiLink("[[운영]] ")).toBe(false);
    });

    it("[[가 아예 없으면 false", () => {
      expect(isInsideOpenWikiLink("일반 텍스트")).toBe(false);
    });

    it("개행을 건너 [[가 있었다면(다른 줄) false", () => {
      expect(isInsideOpenWikiLink("[[운영\n")).toBe(false);
    });
  });
});
