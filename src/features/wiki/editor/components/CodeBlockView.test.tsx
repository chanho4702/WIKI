import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { WikiEditor, type WikiEditorHandle } from "../WikiEditor";

describe("CodeBlockView", () => {
  it("언어 셀렉트가 보이고 변경이 직렬화에 반영된다", async () => {
    const user = userEvent.setup();
    const ref = createRef<WikiEditorHandle>();
    render(<WikiEditor ref={ref} initialMarkdown={"```ts\nconst a = 1;\n```"} pages={[]} />);
    const select = await screen.findByLabelText("코드 언어");
    expect((select as HTMLSelectElement).value).toBe("ts");
    await user.selectOptions(select, "python");
    expect(ref.current!.getMarkdown()).toContain("```python");
  });

  it("복사 버튼이 코드 내용을 클립보드에 쓴다", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn();
    // jsdom 26의 navigator.clipboard는 getter만 있는 접근자 프로퍼티라 Object.assign이 실패한다 —
    // defineProperty로 재정의해야 한다
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<WikiEditor initialMarkdown={"```ts\nconst a = 1;\n```"} pages={[]} />);
    await user.click(await screen.findByRole("button", { name: "코드 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("const a = 1;"));
  });

  it("언어가 지정된 코드 블록은 lowlight가 붙인 hljs 토큰 span으로 렌더된다", async () => {
    const { container } = render(
      <WikiEditor initialMarkdown={"```ts\nconst a = 1;\n```"} pages={[]} />,
    );
    await screen.findByLabelText("코드 언어");
    await waitFor(() => {
      expect(container.querySelector('span[class^="hljs-"]')).not.toBeNull();
    });
  });

  it("언어가 없는 코드 블록은 하이라이트 토큰 없이 렌더된다", async () => {
    const { container } = render(<WikiEditor initialMarkdown={"```\nconst a = 1;\n```"} pages={[]} />);
    const select = await screen.findByLabelText("코드 언어");
    expect((select as HTMLSelectElement).value).toBe("plaintext");
    expect(container.querySelector('span[class^="hljs-"]')).toBeNull();
  });
});
