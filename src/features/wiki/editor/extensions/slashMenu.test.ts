import { describe, expect, it, vi } from "vitest";
import { SLASH_ITEMS, SlashMenu, filterInsertMenuItems, filterSlashItems, isInsideOpenWikiLink } from "./slashMenu";
import type { SlashItem } from "./slashMenu";
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

    // 회귀(W7 T2 — 줄 중간 가드): 커서가 블록 시작이 아니라 중간(여기서는 줄 끝)에 있으면
    // 이전엔 insertContent가 커서 위치에 그대로 마커를 박아 "안내:[!NOTE] "처럼 마커가 줄 중간에
    // 오고, remarkAlerts의 `^[!TYPE]`(줄 시작 앵커)에 걸리지 않아 조용히 무늬만 blockquote인
    // 텍스트가 됐다. 이제는 항상 현재 텍스트블록의 시작 위치에 마커를 삽입한다.
    it("커서가 블록 중간(줄 끝)에 있어도 마커는 블록 시작에 삽입된다", () => {
      const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("안내:") });
      editor.commands.setTextSelection(editor.state.doc.content.size);
      SLASH_ITEMS.find((i) => i.id === id)!.run(editor);
      const md = serializeMarkdown(editor.getJSON()).trim();
      const escapedMarker = marker.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
      expect(md).toBe(`> ${escapedMarker} 안내:`);
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

  describe("filterInsertMenuItems — InsertMenu 전용 필터(라벨+설명)", () => {
    it("라벨 부분 일치는 filterSlashItems와 동일하게 동작한다", () => {
      expect(filterInsertMenuItems("표").map((i) => i.id)).toEqual(["table"]);
    });

    it("설명(description) 부분 일치로도 항목을 찾는다 — filterSlashItems(라벨 전용)는 못 찾는다", () => {
      // "구분선" 항목의 설명은 "가로 구분선을 추가합니다" — "가로"는 라벨엔 없고 설명에만 있다.
      expect(filterSlashItems("가로").map((i) => i.id)).toEqual([]);
      expect(filterInsertMenuItems("가로").map((i) => i.id)).toEqual(["divider"]);
    });

    it("대소문자 무관 부분 일치", () => {
      expect(filterInsertMenuItems("URL").map((i) => i.id)).toEqual(["image"]);
    });
  });

  // W7 T2 — slashMenu의 Suggestion "command" 분기(action: "openEmoji")를 Editor 인스턴스로
  // 직접 검증한다. onStateChange가 매 onStart/onUpdate마다 넘겨주는 command 콜백이 곧
  // Suggestion 내부에서 이 파일의 `command: ({ editor, range, props }) => {...}` 핸들러로
  // 이어지므로, 이 콜백을 직접 호출하면 InsertMenu.select/실사용자 클릭 없이도 그 분기를
  // 그대로 실행하게 된다(플러그인 내부를 우회 노출할 필요가 없었다).
  describe("SlashMenu 확장 — Suggestion command 경유 직접 호출", () => {
    it("'/' 입력으로 팝업이 뜨고, emoji 항목의 command를 호출하면 onOpenEmoji가 불리고 문서는 바뀌지 않는다", async () => {
      const onOpenEmoji = vi.fn();
      let latest: { items: SlashItem[]; command: (item: SlashItem) => void } | null = null;
      const editor = new Editor({
        extensions: [
          ...buildBaseExtensions(),
          SlashMenu.configure({
            onStateChange: (state) => {
              latest = state;
            },
            onOpenEmoji,
          }),
        ],
        content: parseMarkdown(""),
      });

      editor.commands.insertContent("/");
      // Suggestion 플러그인의 view.update는 async(items()를 await한 뒤 onStart를 호출)이므로
      // 마이크로태스크 한 틱을 흘려보내야 한다 — App.w4-autocomplete.test.tsx의 동일 패턴.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(latest).not.toBeNull();
      const emojiItem = latest!.items.find((i) => i.id === "emoji");
      expect(emojiItem).toBeDefined();

      latest!.command(emojiItem!);

      expect(onOpenEmoji).toHaveBeenCalledTimes(1);
      // command 핸들러가 "/" 트리거 범위(range)를 지우기만 하고, run()은 호출하지 않으므로
      // 문서에는 아무 텍스트도 남지 않는다.
      expect(serializeMarkdown(editor.getJSON()).trim()).toBe("");
      editor.destroy();
    });

    it("'/' 입력으로 emoji가 아닌 항목(h1)의 command를 호출하면 onOpenEmoji 없이 run이 실행된다", async () => {
      const onOpenEmoji = vi.fn();
      let latest: { items: SlashItem[]; command: (item: SlashItem) => void } | null = null;
      const editor = new Editor({
        extensions: [
          ...buildBaseExtensions(),
          SlashMenu.configure({
            onStateChange: (state) => {
              latest = state;
            },
            onOpenEmoji,
          }),
        ],
        content: parseMarkdown(""),
      });

      editor.commands.insertContent("/");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(latest).not.toBeNull();
      const h1Item = latest!.items.find((i) => i.id === "h1")!;

      latest!.command(h1Item);

      expect(onOpenEmoji).not.toHaveBeenCalled();
      expect(editor.isActive("heading", { level: 1 })).toBe(true);
      editor.destroy();
    });
  });
});
