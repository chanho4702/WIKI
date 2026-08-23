import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "./base";
import { AlertDecoration } from "./alertDecoration";
import { parseMarkdown } from "../markdown";

function mount(md: string) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const editor = new Editor({
    element: el,
    extensions: [...buildBaseExtensions(), AlertDecoration],
    content: parseMarkdown(md),
  });
  return { editor, el };
}

describe("alertDecoration — 편집 중 GitHub-style Alerts 라이브 프리뷰", () => {
  it.each([
    ["NOTE", "note"],
    ["TIP", "tip"],
    ["IMPORTANT", "important"],
    ["WARNING", "warning"],
    ["CAUTION", "caution"],
  ])("[!%s] blockquote에 md-alert md-alert-%s 클래스를 부여한다", (type, cls) => {
    const { editor, el } = mount(`> [!${type}] 내용`);
    const bq = el.querySelector("blockquote");
    expect(bq).not.toBeNull();
    expect(bq).toHaveClass("md-alert");
    expect(bq).toHaveClass(`md-alert-${cls}`);
    editor.destroy();
  });

  it("마커가 아닌 일반 인용구는 md-alert 데코레이션이 없다", () => {
    const { editor, el } = mount("> 그냥 인용문입니다");
    const bq = el.querySelector("blockquote");
    expect(bq).not.toBeNull();
    expect(bq).not.toHaveClass("md-alert");
    expect(el.querySelector(".md-alert-marker")).toBeNull();
    editor.destroy();
  });

  it("마커 텍스트 범위에만 md-alert-marker(숨김 대상)가 붙고, 그 자리에 아이콘 위젯이 그려진다", () => {
    const { editor, el } = mount("> [!NOTE] 본문내용");
    const marker = el.querySelector(".md-alert-marker");
    expect(marker).not.toBeNull();
    expect(marker?.textContent).toBe("[!NOTE]");
    expect(marker?.textContent).not.toContain("본문내용");
    // CSS로 숨겨도 텍스트는 편집 가능한 문서 안에 그대로 남는다(왕복 안전)
    expect(el.querySelector("blockquote")?.textContent).toBe("[!NOTE] 본문내용");
    expect(el.querySelector(".md-alert-icon-widget svg")).not.toBeNull();
    editor.destroy();
  });

  it("커서가 패널 안이면 타입 스위처가 뜨고, 클릭하면 마커가 치환된다", () => {
    const { editor, el } = mount("> [!NOTE] 내용");
    // 초기 선택도 첫 텍스트블록(패널 안)이라 스위처가 이미 떠 있다
    editor.chain().focus().setTextSelection(12).run(); // "내용" 안쪽
    const switcher = el.querySelector(".md-alert-switcher");
    expect(switcher).not.toBeNull();
    const buttons = switcher!.querySelectorAll("button.md-alert-switch");
    expect(buttons.length).toBe(5);
    expect(switcher!.querySelector('[aria-label="정보 패널로 전환"]')?.getAttribute("aria-pressed")).toBe("true");

    const tipBtn = switcher!.querySelector('[aria-label="성공 패널로 전환"]') as HTMLElement;
    tipBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(el.querySelector("blockquote")?.textContent).toBe("[!TIP] 내용");
    expect(el.querySelector("blockquote")).toHaveClass("md-alert-tip");
    editor.destroy();
  });

  it("문서가 바뀌면 데코레이션도 재계산된다 — 마커 삭제 시 md-alert 클래스가 사라진다", () => {
    const { editor, el } = mount("> [!NOTE] 내용");
    expect(el.querySelector("blockquote")).toHaveClass("md-alert");

    // doc 위치 2~9 = "[!NOTE]" 7글자(텍스트는 blockquote 진입(+1) + paragraph 진입(+1) = pos 2부터 시작).
    // 마커만 지우고 뒤의 " 내용"은 그대로 남긴다 — blockquote 자체는 유지된 채 마커만 사라지는 케이스.
    editor.chain().focus().deleteRange({ from: 2, to: 9 }).run();

    const bq = el.querySelector("blockquote");
    expect(bq).not.toBeNull(); // blockquote는 그대로 남아있다
    expect(bq).not.toHaveClass("md-alert");
    expect(el.querySelector(".md-alert-marker")).toBeNull();
    editor.destroy();
  });
});
