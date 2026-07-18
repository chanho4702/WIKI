import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "../extensions/base";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { TopToolbar } from "./TopToolbar";

describe("TopToolbar", () => {
  it("블록 타입 셀렉트로 문단을 제목1로 바꾼다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    editor.commands.selectAll();
    render(<TopToolbar editor={editor} />);
    await user.selectOptions(screen.getByLabelText("블록 타입"), "h1");
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("# 본문");
    editor.destroy();
  });

  it("굵게 토글 후 셀렉션이 바뀌면 활성 상태가 갱신된다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    editor.commands.selectAll();
    render(<TopToolbar editor={editor} />);
    const bold = screen.getByRole("button", { name: "굵게" });
    await user.click(bold);
    expect(bold).toHaveAttribute("aria-pressed", "true");
    editor.destroy();
  });

  it("실행 취소 버튼이 마지막 변경을 되돌린다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    editor.commands.insertContentAt(editor.state.doc.content.size, "추가");
    render(<TopToolbar editor={editor} />);
    await user.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("본문");
    editor.destroy();
  });

  // W7 T2 — BubbleToolbar.test.tsx("링크 버튼은 URL을 물어 링크를 건다")와 동일 패턴
  it("링크 버튼은 URL을 물어 선택 텍스트에 링크를 건다", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://example.com");
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    editor.commands.selectAll();
    render(<TopToolbar editor={editor} />);
    await user.click(screen.getByRole("button", { name: "링크" }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("[본문](https://example.com)");
    promptSpy.mockRestore();
    editor.destroy();
  });

  it("이미지 버튼은 URL을 물어 이미지 노드를 삽입한다", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://example.com/a.png");
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("") });
    render(<TopToolbar editor={editor} />);
    await user.click(screen.getByRole("button", { name: "이미지" }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("![](https://example.com/a.png)");
    promptSpy.mockRestore();
    editor.destroy();
  });

  it("이미지 버튼에서 URL 프롬프트를 취소하면(null) 아무것도 삽입되지 않는다", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<TopToolbar editor={editor} />);
    await user.click(screen.getByRole("button", { name: "이미지" }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("본문");
    promptSpy.mockRestore();
    editor.destroy();
  });

  // W7 T2 — InsertMenu(+ 버튼)의 "이모지" 항목은 run이 no-op이라 TopToolbar가 넘긴 onOpenEmoji로
  // 위임돼야 한다. controlled emojiPickerOpen/onEmojiPickerOpenChange를 함께 넘겨 배선을 검증한다.
  it("InsertMenu에서 '이모지' 항목을 선택하면 onEmojiPickerOpenChange(true)가 호출된다", async () => {
    const user = userEvent.setup();
    const onEmojiPickerOpenChange = vi.fn();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(
      <TopToolbar
        editor={editor}
        emojiPickerOpen={false}
        onEmojiPickerOpenChange={onEmojiPickerOpenChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "요소 삽입" }));
    // EmojiPicker 자체 트리거 버튼도 aria-label="이모지"라 이름이 겹친다 — InsertMenu 팝오버
    // 안(role=listbox)의 "이모지" 항목으로 범위를 좁힌다.
    const insertMenuList = screen.getByRole("listbox", { name: "요소 삽입 메뉴" });
    await user.click(within(insertMenuList).getByRole("button", { name: "이모지" }));
    expect(onEmojiPickerOpenChange).toHaveBeenCalledWith(true);
    editor.destroy();
  });

  // W7 T2 — 반쪽 제어 방지: emojiPickerOpen/onEmojiPickerOpenChange 중 하나만 넘기면(배선 실수)
  // dev 콘솔 경고를 내고 내부 상태로 폴백한다(useControlledOpenState 공용 판정).
  it("emojiPickerOpen만 넘기고 onEmojiPickerOpenChange를 빠뜨리면 콘솔 경고를 낸다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<TopToolbar editor={editor} emojiPickerOpen />);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("TopToolbar"));
    warnSpy.mockRestore();
    editor.destroy();
  });

  it("onEmojiPickerOpenChange만 넘기고 emojiPickerOpen을 빠뜨리면 콘솔 경고를 낸다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<TopToolbar editor={editor} onEmojiPickerOpenChange={() => {}} />);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("TopToolbar"));
    warnSpy.mockRestore();
    editor.destroy();
  });
});
