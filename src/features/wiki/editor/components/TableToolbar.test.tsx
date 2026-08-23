import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "../extensions/base";
import { parseMarkdown } from "../markdown";
import { TableToolbar } from "./TableToolbar";

const TABLE_MD = "| a | b |\n| --- | --- |\n| c | d |\n";

function makeEditor(md: string) {
  return new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown(md) });
}

function fireMouseDown(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
}

describe("TableToolbar — 표 컨텍스트 컨트롤", () => {
  it("커서가 표 밖이면 렌더되지 않는다", () => {
    const editor = makeEditor("본문\n\n" + TABLE_MD);
    editor.commands.setTextSelection(2); // 첫 문단 안
    const { container } = render(<TableToolbar editor={editor} />);
    expect(container.querySelector(".table-toolbar")).toBeNull();
    editor.destroy();
  });

  it("표 안이면 행/열 추가·삭제가 동작한다", () => {
    const editor = makeEditor(TABLE_MD);
    editor.commands.setTextSelection(4); // 헤더 셀 안
    render(<TableToolbar editor={editor} />);

    const rowsOf = () =>
      editor.getJSON().content!.find((n) => n.type === "table")!.content!.length;
    const before = rowsOf();
    fireMouseDown(screen.getByRole("button", { name: "아래에 행 추가" }));
    expect(rowsOf()).toBe(before + 1);

    fireMouseDown(screen.getByRole("button", { name: "오른쪽에 열 추가" }));
    const table = editor.getJSON().content!.find((n) => n.type === "table")!;
    expect(table.content![0].content).toHaveLength(3);
    editor.destroy();
  });

  it("셀 다중 선택이 없으면 병합 버튼은 비활성", () => {
    const editor = makeEditor(TABLE_MD);
    editor.commands.setTextSelection(4);
    render(<TableToolbar editor={editor} />);
    expect(screen.getByRole("button", { name: "셀 병합" })).toBeDisabled();
    editor.destroy();
  });

  it("표 삭제 버튼이 표를 제거한다", () => {
    const editor = makeEditor(TABLE_MD);
    editor.commands.setTextSelection(4);
    render(<TableToolbar editor={editor} />);
    fireMouseDown(screen.getByRole("button", { name: "표 삭제" }));
    expect(editor.getJSON().content!.some((n) => n.type === "table")).toBe(false);
    editor.destroy();
  });
});
