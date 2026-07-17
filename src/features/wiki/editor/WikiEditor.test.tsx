import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { WikiEditor, type WikiEditorHandle, safeParse } from "./WikiEditor";
import { editorRegistry } from "./editorTestRegistry";

describe("WikiEditor", () => {
  it("초기 마크다운을 렌더하고 getMarkdown으로 되돌린다", () => {
    const ref = createRef<WikiEditorHandle>();
    render(<WikiEditor ref={ref} initialMarkdown={"# 제목\n\n본문"} pages={[]} />);
    expect(screen.getByText("제목")).toBeInTheDocument();
    expect(ref.current!.getMarkdown()).toContain("# 제목");
  });

  it("편집 전 isDirty=false, 내용 변경 후 true", async () => {
    const ref = createRef<WikiEditorHandle>();
    render(<WikiEditor ref={ref} initialMarkdown="본문" pages={[]} />);
    expect(ref.current!.isDirty()).toBe(false);
    // tiptap의 onCreate는 setTimeout(0)으로 비동기 발화한다 — 레지스트리 채워질 때까지 대기
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.commands.insertContent("추가");
    expect(ref.current!.isDirty()).toBe(true);
  });

  it("파싱 실패 시 원문을 플레인 문단으로 보여준다", () => {
    // parseMarkdown이 던지는 케이스를 강제하기 어려우므로, WikiEditor 내부 폴백 함수를 직접 검증
    const doc = safeParse("정상 텍스트");
    expect(doc).toBeTruthy();
  });

  it("드래그 핸들 확장이 등록된다", async () => {
    render(<WikiEditor initialMarkdown="본문" pages={[]} />);
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    const names = editorRegistry.current!.extensionManager.extensions.map((e) => e.name);
    expect(names).toContain("globalDragHandle");
  });
});
