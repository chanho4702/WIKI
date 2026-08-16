import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const store = vi.hoisted(() => ({ fetchInlineAttachment: vi.fn() }));

vi.mock("../store/wikiStore", () => ({
  attachmentIdFromInlineUrl: (src: string) =>
    /^\/api\/wiki\/attachments\/(\d+)\/inline$/.exec(src)?.[1] ?? null,
  fetchInlineAttachment: store.fetchInlineAttachment,
}));

import { MarkdownView } from "./MarkdownView";

describe("MarkdownView 인증 첨부 이미지", () => {
  beforeEach(() => {
    store.fetchInlineAttachment.mockReset().mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:secure-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("내부 attachment ID를 인증 fetch한 Blob URL로 렌더하고 해제한다", async () => {
    const { unmount } = render(
      <MarkdownView markdown="![보안 이미지](/api/wiki/attachments/7/inline)" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("이미지 불러오는 중");

    const image = await screen.findByRole("img", { name: "보안 이미지" });
    expect(image).toHaveAttribute("src", "blob:secure-image");
    expect(store.fetchInlineAttachment).toHaveBeenCalledWith("7", expect.any(AbortSignal));

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:secure-image");
  });

  it("외부 URL 이미지는 인증 fetch 없이 기존 동작을 유지한다", async () => {
    render(<MarkdownView markdown="![외부](https://example.com/image.png)" />);
    await waitFor(() => expect(screen.getByRole("img", { name: "외부" })).toBeInTheDocument());
    expect(store.fetchInlineAttachment).not.toHaveBeenCalled();
  });
});
