import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "../extensions/base";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { EmojiPicker } from "./EmojiPicker";

describe("EmojiPicker", () => {
  it("이모지 버튼을 누르면 팝오버가 열리고 검색 입력에 포커스된다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<EmojiPicker editor={editor} />);
    const trigger = screen.getByRole("button", { name: "이모지" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByPlaceholderText("이모지 검색")).toHaveFocus();
    editor.destroy();
  });

  it("카테고리 탭을 누르면 해당 카테고리의 이모지만 그리드에 보인다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<EmojiPicker editor={editor} />);
    await user.click(screen.getByRole("button", { name: "이모지" }));
    // 기본 카테고리는 "표정" — 표정 카테고리의 항목이 보인다
    expect(screen.getByRole("button", { name: "웃음" })).toBeInTheDocument();
    // "자연" 탭으로 전환하면 표정 항목은 사라지고 자연 항목이 보인다
    await user.click(screen.getByRole("tab", { name: "자연" }));
    expect(screen.queryByRole("button", { name: "웃음" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "해" })).toBeInTheDocument();
    editor.destroy();
  });

  it("검색어로 카테고리 무관 키워드 부분 일치 검색이 된다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<EmojiPicker editor={editor} />);
    await user.click(screen.getByRole("button", { name: "이모지" }));
    await user.type(screen.getByPlaceholderText("이모지 검색"), "완료");
    expect(screen.getByRole("button", { name: "체크" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "웃음" })).not.toBeInTheDocument();
    // 검색 중에는 카테고리 탭이 숨겨진다
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    editor.destroy();
  });

  it("일치하는 이모지가 없으면 안내 문구를 보여준다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<EmojiPicker editor={editor} />);
    await user.click(screen.getByRole("button", { name: "이모지" }));
    await user.type(screen.getByPlaceholderText("이모지 검색"), "존재하지않는검색어");
    expect(screen.getByText("일치하는 이모지가 없습니다")).toBeInTheDocument();
    editor.destroy();
  });

  it("이모지를 클릭하면 에디터에 삽입되고 팝오버가 닫힌다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("") });
    render(<EmojiPicker editor={editor} />);
    await user.click(screen.getByRole("button", { name: "이모지" }));
    await user.click(screen.getByRole("button", { name: "웃음" }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("😀");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    editor.destroy();
  });

  it("Escape로 닫히면 트리거 버튼으로 포커스가 되돌아간다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<EmojiPicker editor={editor} />);
    const trigger = screen.getByRole("button", { name: "이모지" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    editor.destroy();
  });

  it("외부 클릭으로 닫히면 클릭 대상이 포커스를 받고 트리거는 강탈하지 않는다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(
      <div>
        <EmojiPicker editor={editor} />
        <button type="button">다른 버튼</button>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "이모지" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    const other = screen.getByRole("button", { name: "다른 버튼" });
    await user.click(other);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(other).toHaveFocus();
    expect(trigger).not.toHaveFocus();
    editor.destroy();
  });

  it("open/onOpenChange를 controlled로 넘기면 외부에서 연 상태를 그대로 반영한다", () => {
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<EmojiPicker editor={editor} open onOpenChange={() => {}} />);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    editor.destroy();
  });
});
