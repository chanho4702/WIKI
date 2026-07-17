import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("항목에 라벨과 설명이 함께 렌더된다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(<InsertMenu editor={editor} />);
    await user.click(screen.getByRole("button", { name: "요소 삽입" }));
    expect(screen.getByRole("option", { name: "제목 1" })).toBeInTheDocument();
    expect(screen.getByText("큰 섹션 제목을 추가합니다")).toBeInTheDocument();
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

  it("외부 클릭으로 닫히면 트리거 버튼으로 포커스가 되돌아간다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    render(
      <div>
        <InsertMenu editor={editor} />
        {/* 포커스 가능하지 않은 순수 바깥 영역 — 클릭 자체가 포커스를 가져가지 않으므로
            "외부 클릭 시 트리거로 포커스 복귀" 동작만 순수하게 검증할 수 있다. */}
        <div data-testid="outside">바깥 영역</div>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "요소 삽입" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByTestId("outside"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    editor.destroy();
  });
});
