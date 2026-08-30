import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownView } from "./MarkdownView";

/**
 * 섹션 앵커(W23). rehype-slug가 id를 이미 붙여 두고 있었는데 복사할 방법이 없어서, 문서의 한 절을
 * 가리키려면 주소창에서 손으로 `#`을 붙여야 했다.
 */
describe("MarkdownView 섹션 앵커", () => {
  it("헤딩마다 링크 복사 버튼이 있고 누르면 #slug URL을 복사한다", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<MarkdownView markdown={"## 배포 절차\n\n본문"} />);

    await user.click(screen.getByRole("button", { name: "섹션 링크 복사" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/#배포-절차$/));
  });

  /** 인라인 댓글 앵커는 렌더된 텍스트로 구간을 잡는다 — 버튼이 글자를 보태면 인용 매칭이 어긋난다. */
  it("앵커 버튼은 헤딩 텍스트에 글자를 보태지 않는다", () => {
    render(<MarkdownView markdown={"## 배포 절차"} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("배포 절차");
  });
});
