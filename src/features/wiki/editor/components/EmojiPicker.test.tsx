import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
    // W7 T1 — 탭은 role="tab"/tablist 대신 aria-pressed가 있는 일반 버튼으로 단순화했다
    // (tablist/tabpanel 정합 없이 role만 tab이던 W6 리뷰 Issue #1 해소).
    await user.click(screen.getByRole("button", { name: "자연" }));
    expect(screen.queryByRole("button", { name: "웃음" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "해" })).toBeInTheDocument();
    editor.destroy();
  });

  it("카테고리 버튼은 aria-pressed로 현재 선택 상태를 드러낸다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<EmojiPicker editor={editor} />);
    await user.click(screen.getByRole("button", { name: "이모지" }));
    const faces = screen.getByRole("button", { name: "표정" });
    const nature = screen.getByRole("button", { name: "자연" });
    expect(faces).toHaveAttribute("aria-pressed", "true");
    expect(nature).toHaveAttribute("aria-pressed", "false");
    await user.click(nature);
    expect(nature).toHaveAttribute("aria-pressed", "true");
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
    expect(screen.queryByRole("group", { name: "이모지 카테고리" })).not.toBeInTheDocument();
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

  // W7 T1 — EmojiPicker ARIA(W6 최종 리뷰 Issue #1): role=listbox의 자식은 role=option이어야 한다.
  it("그리드 항목은 role=option으로 감싸여 있고, 하이라이트된 항목만 aria-selected=true다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<EmojiPicker editor={editor} />);
    await user.click(screen.getByRole("button", { name: "이모지" }));
    const first = screen.getByRole("option", { name: "웃음" });
    expect(first).toHaveAttribute("aria-selected", "true");
    const second = screen.getByRole("option", { name: "활짝미소" });
    expect(second).toHaveAttribute("aria-selected", "false");
    editor.destroy();
  });

  it("검색 입력에서 화살표 오른쪽/아래로 하이라이트가 이동하고 Enter로 선택된다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("") });
    render(<EmojiPicker editor={editor} />);
    await user.click(screen.getByRole("button", { name: "이모지" }));
    const filter = screen.getByPlaceholderText("이모지 검색");
    // 표정 카테고리 순서: 웃음(0), 활짝미소(1) ... → 오른쪽 한 번이면 활짝미소가 선택된다
    fireEvent.keyDown(filter, { key: "ArrowRight" });
    expect(screen.getByRole("option", { name: "활짝미소" })).toHaveAttribute("aria-selected", "true");
    // 왼쪽으로 되돌아오면 다시 첫 항목
    fireEvent.keyDown(filter, { key: "ArrowLeft" });
    expect(screen.getByRole("option", { name: "웃음" })).toHaveAttribute("aria-selected", "true");
    // 아래로 한 행(열 수 6칸) 이동 후 Enter로 선택 — index 0 + 6 = index 6("🤣", 폭소)
    fireEvent.keyDown(filter, { key: "ArrowDown" });
    fireEvent.keyDown(filter, { key: "Enter" });
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("🤣");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    editor.destroy();
  });

  it("화살표 위로는 첫 항목에서 같은 열의 마지막 행 항목으로 되돌아간다(래핑)", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<EmojiPicker editor={editor} />);
    await user.click(screen.getByRole("button", { name: "이모지" }));
    const filter = screen.getByPlaceholderText("이모지 검색");
    fireEvent.keyDown(filter, { key: "ArrowUp" });
    // 표정 카테고리는 30개(열 6칸, 5행) — index 0에서 위로 가면 같은 열의 마지막 행인 index 24
    const options = screen.getAllByRole("option");
    expect(options[24]).toHaveAttribute("aria-selected", "true");
    editor.destroy();
  });

  // W7 T1 — Tab-out 갭: 검색 입력에서 Tab으로 컨테이너 밖으로 나가면(포커스 강탈 없이) 팝오버가
  // 닫혀야 한다.
  it("검색 입력에서 Tab으로 컨테이너 밖으로 나가면(Tab-out) 포커스를 빼앗지 않고 팝오버만 닫힌다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(
      <div>
        <EmojiPicker editor={editor} />
        <button type="button">다음 버튼</button>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "이모지" });
    await user.click(trigger);
    const filter = screen.getByPlaceholderText("이모지 검색");
    const next = screen.getByRole("button", { name: "다음 버튼" });
    fireEvent.focusOut(filter, { relatedTarget: next });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).not.toHaveFocus();
    editor.destroy();
  });

  // W7 T1 — Escape 승격: 카테고리 버튼(tabIndex={-1}이지만 클릭하면 포커스를 받을 수 있다)에
  // 포커스가 가 있어도 Escape가 동작해야 한다(이전엔 필터 input에만 바인딩돼 있었다).
  it("카테고리 버튼에 포커스가 가 있어도 Escape를 누르면 닫히고 트리거로 포커스가 되돌아간다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<EmojiPicker editor={editor} />);
    const trigger = screen.getByRole("button", { name: "이모지" });
    await user.click(trigger);
    const categoryButton = screen.getByRole("button", { name: "자연" });
    categoryButton.focus();
    fireEvent.keyDown(categoryButton, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    editor.destroy();
  });
});
