import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
