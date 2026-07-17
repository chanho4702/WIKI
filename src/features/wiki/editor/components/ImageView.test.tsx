import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WikiEditor } from "../WikiEditor";

describe("ImageView", () => {
  it("로드 실패 시 대체 텍스트 placeholder 박스를 보여준다", async () => {
    render(<WikiEditor initialMarkdown="![다이어그램](https://example.com/broken.png)" pages={[]} />);
    const img = await screen.findByRole("img", { name: "다이어그램" });
    fireEvent.error(img);
    expect(screen.getByText(/다이어그램/)).toBeInTheDocument();
    expect(screen.getByText(/이미지를 불러올 수 없습니다/)).toBeInTheDocument();
  });
});
