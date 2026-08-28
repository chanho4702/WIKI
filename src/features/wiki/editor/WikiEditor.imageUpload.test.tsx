import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";

const store = vi.hoisted(() => ({
  uploadAttachment: vi.fn(),
  confirmAttachments: vi.fn(),
  deleteAttachment: vi.fn(),
  fetchInlineAttachment: vi.fn(),
}));

vi.mock("../store/wikiStore", () => ({
  uploadAttachment: store.uploadAttachment,
  confirmAttachments: store.confirmAttachments,
  deleteAttachment: store.deleteAttachment,
  inlineAttachmentUrl: (id: string) => `/api/wiki/attachments/${id}/inline`,
  attachmentIdFromInlineUrl: (src: string) =>
    /^\/api\/wiki\/attachments\/(\d+)\/inline$/.exec(src)?.[1] ?? null,
  fetchInlineAttachment: store.fetchInlineAttachment,
}));

import { WikiEditor, type WikiEditorHandle } from "./WikiEditor";
import { editorRegistry } from "./editorTestRegistry";
import * as Y from "yjs";
import { buildCollaborationExtensions } from "./extensions/collaboration";

describe("WikiEditor 이미지 업로드", () => {
  beforeEach(() => {
    store.uploadAttachment.mockReset();
    store.confirmAttachments.mockReset().mockResolvedValue(undefined);
    store.deleteAttachment.mockReset().mockResolvedValue(undefined);
    store.fetchInlineAttachment.mockReset().mockResolvedValue(new Blob([new Uint8Array([1])], { type: "image/png" }));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:wiki-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("파일 선택 업로드 후 host 없는 attachment ID 경로를 마크다운에 저장한다", async () => {
    store.uploadAttachment.mockResolvedValue({
      id: "7",
      pageId: "2",
      filename: "diagram.png",
      contentType: "image/png",
      sizeBytes: 12,
    });
    const ref = createRef<WikiEditorHandle>();
    const { container } = render(
      <WikiEditor ref={ref} initialMarkdown="본문" spaceId="sp1" pageId="2" />,
    );
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());

    fireEvent.mouseDown(screen.getByRole("button", { name: "이미지" }));
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "diagram.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(store.uploadAttachment).toHaveBeenCalledWith(
      "2",
      file,
      expect.objectContaining({
        pending: true,
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      }),
    ));
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain("/api/wiki/attachments/7/inline"));
    expect(ref.current!.getMarkdown()).not.toContain("blob:wiki-image");
    expect(ref.current!.isDirty()).toBe(true);
  });

  it("공동 편집 이미지는 broadcast 전에 durable 확정해 세션 종료가 삭제하지 못하게 한다", async () => {
    store.uploadAttachment.mockResolvedValue({
      id: "71",
      pageId: "2",
      filename: "shared.png",
      contentType: "image/png",
      sizeBytes: 12,
    });
    const document = new Y.Doc();
    const ref = createRef<WikiEditorHandle>();
    const view = render(
      <WikiEditor
        ref={ref}
        initialMarkdown=""
        spaceId="sp1"
        pageId="2"
        collaborationExtensions={buildCollaborationExtensions({ document })}
      />,
    );
    const input = view.container.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "shared.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(store.confirmAttachments).toHaveBeenCalledWith("2", ["71"]));
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain("/api/wiki/attachments/71/inline"));
    await ref.current!.discardPendingUploads();
    expect(store.deleteAttachment).not.toHaveBeenCalledWith("71");
    expect(store.confirmAttachments).toHaveBeenCalledOnce();

    view.unmount();
    document.destroy();
  });

  it("paste와 drop도 같은 업로드 파이프라인을 사용한다", async () => {
    store.uploadAttachment
      .mockResolvedValueOnce({ id: "8", pageId: "2", filename: "paste.png", contentType: "image/png", sizeBytes: 3 })
      .mockResolvedValueOnce({ id: "9", pageId: "2", filename: "drop.webp", contentType: "image/webp", sizeBytes: 3 });
    const { container } = render(<WikiEditor initialMarkdown="본문" spaceId="sp1" pageId="2" />);
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    const root = container.querySelector(".wiki-editor")!;
    const pasted = new File([new Uint8Array([1])], "paste.png", { type: "image/png" });
    const dropped = new File([new Uint8Array([2])], "drop.webp", { type: "image/webp" });

    fireEvent.paste(root, { clipboardData: { files: [pasted] } });
    await waitFor(() => expect(store.uploadAttachment).toHaveBeenCalledWith(
      "2", pasted, expect.objectContaining({ pending: true }),
    ));
    vi.spyOn(editorRegistry.current!.view, "posAtCoords").mockReturnValue({ pos: 1, inside: -1 });
    fireEvent.drop(root, { dataTransfer: { files: [dropped] }, clientX: 10, clientY: 10 });

    await waitFor(() => expect(store.uploadAttachment).toHaveBeenCalledWith(
      "2", dropped, expect.objectContaining({ pending: true }),
    ));
    expect(store.uploadAttachment).toHaveBeenCalledTimes(2);
  });

  it("여러 파일은 동시에 전송을 시작하고 문서에는 선택 순서대로 넣는다", async () => {
    let finishFirst!: (value: unknown) => void;
    let finishSecond!: (value: unknown) => void;
    store.uploadAttachment
      .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { finishSecond = resolve; }));
    const ref = createRef<WikiEditorHandle>();
    const { container } = render(
      <WikiEditor ref={ref} initialMarkdown="본문" spaceId="sp1" pageId="2" />,
    );
    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.png", { type: "image/png" });
    const input = container.querySelector("input[type='file']") as HTMLInputElement;

    fireEvent.change(input, { target: { files: [first, second] } });
    await waitFor(() => expect(store.uploadAttachment).toHaveBeenCalledTimes(2));

    finishSecond({ id: "22", pageId: "2", filename: "second.png", contentType: "image/png", sizeBytes: 6 });
    finishFirst({ id: "21", pageId: "2", filename: "first.png", contentType: "image/png", sizeBytes: 5 });
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain("/attachments/22/inline"));

    const markdown = ref.current!.getMarkdown();
    expect(markdown.indexOf("/attachments/21/inline"))
      .toBeLessThan(markdown.indexOf("/attachments/22/inline"));
  });

  it("서버가 이미지로 판정하지 않으면 삽입하지 않고 업로드 객체를 삭제한다", async () => {
    store.uploadAttachment.mockResolvedValue({
      id: "10",
      pageId: "2",
      filename: "fake.png",
      contentType: "application/octet-stream",
      sizeBytes: 10,
    });
    const ref = createRef<WikiEditorHandle>();
    const { container } = render(<WikiEditor ref={ref} initialMarkdown="본문" spaceId="sp1" pageId="2" />);
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["<script>"], "fake.png", { type: "image/png" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("안전한 이미지 형식");
    expect(store.deleteAttachment).toHaveBeenCalledWith("10");
    expect(ref.current!.getMarkdown()).not.toContain("/attachments/10/");
  });

  it("업로드 진행 상태를 부모에 알려 저장 경쟁을 막을 수 있게 한다", async () => {
    let finish!: (value: unknown) => void;
    store.uploadAttachment.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const onUploadStateChange = vi.fn();
    const { container } = render(
      <WikiEditor
        initialMarkdown="본문"
        spaceId="sp1"
        pageId="2"
        onUploadStateChange={onUploadStateChange}
      />,
    );
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["png"], "slow.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(onUploadStateChange).toHaveBeenLastCalledWith(true));

    finish({ id: "12", pageId: "2", filename: "slow.png", contentType: "image/png", sizeBytes: 3 });
    await waitFor(() => expect(onUploadStateChange).toHaveBeenLastCalledWith(false));
  });

  it("바이트 진행률을 표시하고 취소한 파일을 같은 자리에서 재시도한다", async () => {
    store.uploadAttachment.mockImplementationOnce((
      _pageId: string,
      _file: File,
      options: { signal: AbortSignal; onProgress: (progress: number) => void },
    ) => new Promise((_resolve, reject) => {
      options.onProgress(42);
      options.signal.addEventListener("abort", () => {
        reject(new DOMException("cancelled", "AbortError"));
      }, { once: true });
    }));
    const ref = createRef<WikiEditorHandle>();
    const { container } = render(
      <WikiEditor ref={ref} initialMarkdown="본문" spaceId="sp1" pageId="2" />,
    );
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "slow.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText("업로드 중 · 42%");
    const progress = screen.getByRole("progressbar", { name: "slow.png 업로드 진행률" });
    expect(progress).toHaveAttribute("value", "42");
    fireEvent.click(screen.getByRole("button", { name: "slow.png 업로드 취소" }));
    await screen.findByText("업로드 취소됨");

    store.uploadAttachment.mockResolvedValueOnce({
      id: "13",
      pageId: "2",
      filename: "slow.png",
      contentType: "image/png",
      sizeBytes: 3,
    });
    fireEvent.click(screen.getByRole("button", { name: "slow.png 다시 업로드" }));

    await waitFor(() => expect(store.uploadAttachment).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain("/attachments/13/inline"));
    expect(screen.queryByText("slow.png")).not.toBeInTheDocument();
  });

  it("저장된 본문에 남은 pending attachment를 서버에 확정한다", async () => {
    store.uploadAttachment.mockResolvedValue({
      id: "14",
      pageId: "2",
      filename: "kept.png",
      contentType: "image/png",
      sizeBytes: 3,
    });
    const ref = createRef<WikiEditorHandle>();
    const { container } = render(<WikiEditor ref={ref} initialMarkdown="본문" spaceId="sp1" pageId="2" />);
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["png"], "kept.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain("/attachments/14/inline"));

    await ref.current!.finalizePendingUploads();

    expect(store.confirmAttachments).toHaveBeenCalledWith("2", ["14"]);
    expect(store.deleteAttachment).not.toHaveBeenCalledWith("14");
  });

  it("저장 전 제거한 이미지와 취소한 이미지 업로드를 정리한다", async () => {
    store.uploadAttachment.mockResolvedValue({
      id: "11",
      pageId: "2",
      filename: "unused.png",
      contentType: "image/png",
      sizeBytes: 3,
    });
    const ref = createRef<WikiEditorHandle>();
    const firstRender = render(<WikiEditor ref={ref} initialMarkdown="본문" spaceId="sp1" pageId="2" />);
    const { container } = firstRender;
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    const upload = () => fireEvent.change(input, {
      target: { files: [new File(["png"], "unused.png", { type: "image/png" })] },
    });

    upload();
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain("/attachments/11/inline"));
    editorRegistry.current!.commands.clearContent();
    await ref.current!.finalizePendingUploads();
    expect(store.deleteAttachment).toHaveBeenCalledWith("11");

    // finalize는 저장 성공 뒤 이동하는 경로라 해당 에디터 세션을 닫는다. 취소 정리는 새 세션으로 검증한다.
    firstRender.unmount();
    store.deleteAttachment.mockClear();
    const cancelRef = createRef<WikiEditorHandle>();
    const cancelRender = render(
      <WikiEditor ref={cancelRef} initialMarkdown="본문" spaceId="sp1" pageId="2" />,
    );
    const cancelInput = cancelRender.container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(cancelInput, {
      target: { files: [new File(["png"], "unused.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(cancelRef.current!.getMarkdown()).toContain("/attachments/11/inline"));
    await cancelRef.current!.discardPendingUploads();
    expect(store.deleteAttachment).toHaveBeenCalledWith("11");
  });
});
