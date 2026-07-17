import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WikiEditor } from "../WikiEditor";
import { ImageView } from "./ImageView";
import type { NodeViewProps } from "@tiptap/react";

describe("ImageView", () => {
  it("로드 실패 시 대체 텍스트 placeholder 박스를 보여준다", async () => {
    render(<WikiEditor initialMarkdown="![다이어그램](https://example.com/broken.png)" pages={[]} />);
    const img = await screen.findByRole("img", { name: "다이어그램" });
    fireEvent.error(img);
    expect(screen.getByText(/다이어그램/)).toBeInTheDocument();
    expect(screen.getByText(/이미지를 불러올 수 없습니다/)).toBeInTheDocument();
  });

  it("src가 변경되면 failed 상태를 리셋하고 새로운 이미지를 로드한다", () => {
    const mockNode = {
      attrs: { src: "https://example.com/image1.png", alt: "테스트" },
    };
    const createMockProps = (src: string): NodeViewProps => ({
      node: { ...mockNode, attrs: { src, alt: "테스트" } } as any,
      editor: {} as any,
      getPos: () => 0,
      updateAttributes: () => {},
      deleteNode: () => {},
      selected: false,
      decorations: {} as any,
      view: {} as any,
      innerDecorations: {} as any,
      extension: {} as any,
      HTMLAttributes: {},
    });

    const mockProps = createMockProps("https://example.com/image1.png");

    const { rerender } = render(<ImageView {...mockProps} />);
    const img = screen.getByRole("img", { name: "테스트" }) as HTMLImageElement;

    // 이미지 로드 실패 시뮬레이션
    fireEvent.error(img);
    expect(screen.getByText(/이미지를 불러올 수 없습니다/)).toBeInTheDocument();

    // src 변경 후 리렌더링
    const updatedProps = createMockProps("https://example.com/image2.png");
    rerender(<ImageView {...updatedProps} />);

    // placeholder가 사라지고 새로운 이미지가 렌더됨
    expect(screen.queryByText(/이미지를 불러올 수 없습니다/)).not.toBeInTheDocument();
    const newImg = screen.getByRole("img", { name: "테스트" }) as HTMLImageElement;
    expect(newImg.src).toBe("https://example.com/image2.png");
  });
});
