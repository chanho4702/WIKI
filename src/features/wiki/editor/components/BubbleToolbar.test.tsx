import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "../extensions/base";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { ToolbarButtons } from "./BubbleToolbar";

describe("ToolbarButtons", () => {
  it("굵게 버튼이 선택 텍스트에 bold를 토글한다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    editor.commands.selectAll();
    render(<ToolbarButtons editor={editor} />);
    await user.click(screen.getByRole("button", { name: "굵게" }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("**본문**");
    editor.destroy();
  });

  it("링크 버튼은 URL을 물어 링크를 건다", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://example.com");
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    editor.commands.selectAll();
    render(<ToolbarButtons editor={editor} />);
    await user.click(screen.getByRole("button", { name: "링크" }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("[본문](https://example.com)");
    promptSpy.mockRestore();
    editor.destroy();
  });
});
