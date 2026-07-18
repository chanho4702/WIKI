import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "../extensions/base";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { InsertMenu } from "./InsertMenu";

describe("InsertMenu — 요소 브라우저", () => {
  it("+ 버튼을 누르면 팝오버가 열리고 필터 입력에 포커스된다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<InsertMenu editor={editor} />);
    const trigger = screen.getByRole("button", { name: "요소 삽입" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByPlaceholderText("요소 검색")).toHaveFocus();
    editor.destroy();
  });

  it("항목에 라벨과 설명이 함께 렌더되고, 버튼의 접근 가능한 이름은 라벨만이다(설명은 aria-describedby)", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<InsertMenu editor={editor} />);
    await user.click(screen.getByRole("button", { name: "요소 삽입" }));
    expect(screen.getByRole("option", { name: "제목 1" })).toBeInTheDocument();
    const description = screen.getByText("큰 섹션 제목을 추가합니다");
    expect(description).toBeInTheDocument();
    // getByRole("button", { name: "제목 1" })이 정확히 하나만 매치된다는 것 자체가, 접근 가능한
    // 이름 계산에 설명 텍스트가 섞이지 않았다는(즉 aria-describedby로만 연결됐다는) 증거다.
    const button = screen.getByRole("button", { name: "제목 1" });
    expect(button).toHaveAttribute("aria-describedby", description.id);
    editor.destroy();
  });

  it("필터 입력으로 항목이 좁혀진다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<InsertMenu editor={editor} />);
    await user.click(screen.getByRole("button", { name: "요소 삽입" }));
    await user.type(screen.getByPlaceholderText("요소 검색"), "표");
    expect(screen.getByRole("option", { name: "표" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "제목 1" })).not.toBeInTheDocument();
    editor.destroy();
  });

  it("항목 클릭으로 선택하면 실행 후 팝오버가 닫히고 에디터에 반영된다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<InsertMenu editor={editor} />);
    await user.click(screen.getByRole("button", { name: "요소 삽입" }));
    // role=option은 li(항목 실행은 안쪽 button의 클릭 핸들러다) — 실제 클릭 대상인 button을 조회한다.
    await user.click(screen.getByRole("button", { name: "제목 1" }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("# 본문");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    editor.destroy();
  });

  it("Enter로도 하이라이트된 항목을 선택할 수 있다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<InsertMenu editor={editor} />);
    await user.click(screen.getByRole("button", { name: "요소 삽입" }));
    await user.type(screen.getByPlaceholderText("요소 검색"), "제목 1");
    await user.keyboard("{Enter}");
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("# 본문");
    editor.destroy();
  });

  it("Escape로 닫히면 트리거 버튼으로 포커스가 되돌아간다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<InsertMenu editor={editor} />);
    const trigger = screen.getByRole("button", { name: "요소 삽입" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    editor.destroy();
  });

  // 리뷰 반영(Important #1): 이전엔 외부 클릭 시 preventDefault + 트리거로 포커스를 강제
  // 되돌렸다 — 그 결과 다른 툴바 버튼을 눌러도 포커스는 여전히 +버튼에 남았고, 에디터 본문
  // (contenteditable)을 클릭해도 캐럿이 놓이지 않는 회귀가 있었다. 이제는 닫기만 하고
  // 포커스는 건드리지 않는다 — 클릭 대상이 자연스럽게 포커스/캐럿을 받아야 한다.
  it("메뉴가 열린 채 다른 툴바 버튼을 누르면 메뉴만 닫히고 그 버튼이 포커스를 받는다(트리거로 강탈되지 않음)", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(
      <div>
        <InsertMenu editor={editor} />
        <button type="button">다른 툴바 버튼</button>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "요소 삽입" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    const other = screen.getByRole("button", { name: "다른 툴바 버튼" });
    await user.click(other);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(other).toHaveFocus();
    expect(trigger).not.toHaveFocus();
    editor.destroy();
  });

  // W6 T4 — "이모지" 항목은 SLASH_ITEMS를 그대로 재사용하는 InsertMenu에도 노출되지만, run이
  // no-op이므로 클릭 시 onOpenEmoji로 위임돼야 한다(그렇지 않으면 클릭이 조용히 아무 일도 안 함).
  it("'이모지' 항목을 클릭하면 onOpenEmoji가 호출되고 메뉴가 닫힌다(문서는 바뀌지 않음)", async () => {
    const user = userEvent.setup();
    const onOpenEmoji = vi.fn();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<InsertMenu editor={editor} onOpenEmoji={onOpenEmoji} />);
    await user.click(screen.getByRole("button", { name: "요소 삽입" }));
    await user.click(screen.getByRole("button", { name: "이모지" }));
    expect(onOpenEmoji).toHaveBeenCalledTimes(1);
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("본문");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    editor.destroy();
  });

  it("메뉴가 열린 채 에디터 본문(contenteditable)을 누르면 메뉴만 닫히고 캐럿 배치가 막히지 않는다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(
      <div>
        <InsertMenu editor={editor} />
        <div contentEditable suppressContentEditableWarning data-testid="editor-body">
          본문
        </div>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "요소 삽입" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    const body = screen.getByTestId("editor-body");
    await user.click(body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(body).toHaveFocus();
    expect(trigger).not.toHaveFocus();
    editor.destroy();
  });

  // W7 T1 — Tab-out 갭: 필터 입력에서 Tab으로 컨테이너 밖으로 나가면(포커스 강탈 없이) 메뉴가
  // 닫혀야 한다. relatedTarget이 컨테이너 밖임을 focusout으로 시뮬레이션한다.
  it("필터 입력에서 Tab으로 컨테이너 밖으로 나가면(Tab-out) 포커스를 빼앗지 않고 메뉴만 닫힌다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(
      <div>
        <InsertMenu editor={editor} />
        <button type="button">다음 버튼</button>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "요소 삽입" });
    await user.click(trigger);
    const filter = screen.getByPlaceholderText("요소 검색");
    const next = screen.getByRole("button", { name: "다음 버튼" });
    fireEvent.focusOut(filter, { relatedTarget: next });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).not.toHaveFocus();
    editor.destroy();
  });

  // W7 T1 — Escape 승격: 이전엔 필터 input에만 바인딩돼 있어 다른 항목 버튼에 포커스가 가 있으면
  // Escape가 먹지 않았다. 이제 컨테이너 전체 keydown이라 항목 버튼에서 눌러도 동작해야 한다.
  it("항목 버튼에 포커스가 가 있어도 Escape를 누르면 닫히고 트리거로 포커스가 되돌아간다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<InsertMenu editor={editor} />);
    const trigger = screen.getByRole("button", { name: "요소 삽입" });
    await user.click(trigger);
    const item = screen.getByRole("button", { name: "제목 1" });
    item.focus();
    fireEvent.keyDown(item, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    editor.destroy();
  });
});
