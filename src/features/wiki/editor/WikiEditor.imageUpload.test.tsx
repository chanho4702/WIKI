import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";

const store = vi.hoisted(() => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  fetchInlineAttachment: vi.fn(),
}));

vi.mock("../store/wikiStore", () => ({
  uploadAttachment: store.uploadAttachment,
  deleteAttachment: store.deleteAttachment,
  inlineAttachmentUrl: (id: string) => `/api/wiki/attachments/${id}/inline`,
  attachmentIdFromInlineUrl: (src: string) =>
    /^\/api\/wiki\/attachments\/(\d+)\/inline$/.exec(src)?.[1] ?? null,
  fetchInlineAttachment: store.fetchInlineAttachment,
}));

import { WikiEditor, type WikiEditorHandle } from "./WikiEditor";
import { editorRegistry } from "./editorTestRegistry";

describe("WikiEditor 이미지 업로드", () => {
  beforeEach(() => {
    store.uploadAttachment.mockReset();
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
      <WikiEditor ref={ref} initialMarkdown="본문" pages={[]} pageId="2" />,
    );
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());

    fireEvent.mouseDown(screen.getByRole("button", { name: "이미지" }));
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "diagram.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(store.uploadAttachment).toHaveBeenCalledWith("2", file));
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain("/api/wiki/attachments/7/inline"));
    expect(ref.current!.getMarkdown()).not.toContain("blob:wiki-image");
    expect(ref.current!.isDirty()).toBe(true);
  });

  it("paste와 drop도 같은 업로드 파이프라인을 사용한다", async () => {
    store.uploadAttachment
      .mockResolvedValueOnce({ id: "8", pageId: "2", filename: "paste.png", contentType: "image/png", sizeBytes: 3 })
      .mockResolvedValueOnce({ id: "9", pageId: "2", filename: "drop.webp", contentType: "image/webp", sizeBytes: 3 });
    const { container } = render(<WikiEditor initialMarkdown="본문" pages={[]} pageId="2" />);
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    const root = container.querySelector(".wiki-editor")!;
    const pasted = new File([new Uint8Array([1])], "paste.png", { type: "image/png" });
    const dropped = new File([new Uint8Array([2])], "drop.webp", { type: "image/webp" });

    fireEvent.paste(root, { clipboardData: { files: [pasted] } });
    await waitFor(() => expect(store.uploadAttachment).toHaveBeenCalledWith("2", pasted));
    vi.spyOn(editorRegistry.current!.view, "posAtCoords").mockReturnValue({ pos: 1, inside: -1 });
    fireEvent.drop(root, { dataTransfer: { files: [dropped] }, clientX: 10, clientY: 10 });

    await waitFor(() => expect(store.uploadAttachment).toHaveBeenCalledWith("2", dropped));
    expect(store.uploadAttachment).toHaveBeenCalledTimes(2);
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
    const { container } = render(<WikiEditor ref={ref} initialMarkdown="본문" pages={[]} pageId="2" />);
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
        pages={[]}
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

  it("저장 전 제거한 이미지와 취소한 이미지 업로드를 정리한다", async () => {
    store.uploadAttachment.mockResolvedValue({
      id: "11",
      pageId: "2",
      filename: "unused.png",
      contentType: "image/png",
      sizeBytes: 3,
    });
    const ref = createRef<WikiEditorHandle>();
    const { container } = render(<WikiEditor ref={ref} initialMarkdown="본문" pages={[]} pageId="2" />);
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    const upload = () => fireEvent.change(input, {
      target: { files: [new File(["png"], "unused.png", { type: "image/png" })] },
    });

    upload();
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain("/attachments/11/inline"));
    editorRegistry.current!.commands.clearContent();
    await ref.current!.finalizePendingUploads();
    expect(store.deleteAttachment).toHaveBeenCalledWith("11");

    store.deleteAttachment.mockClear();
    upload();
    await waitFor(() => expect(ref.current!.getMarkdown()).toContain("/attachments/11/inline"));
    await ref.current!.discardPendingUploads();
    expect(store.deleteAttachment).toHaveBeenCalledWith("11");
  });
});
