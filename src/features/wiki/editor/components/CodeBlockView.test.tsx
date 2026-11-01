import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { WikiEditor, type WikiEditorHandle } from "../WikiEditor";
import { chooseOption, optionNames } from "../../../../app/selectTestUtils";

describe("CodeBlockView", () => {
  it("언어 셀렉트가 보이고 변경이 직렬화에 반영된다", async () => {
    const user = userEvent.setup();
    const ref = createRef<WikiEditorHandle>();
    render(<WikiEditor ref={ref} initialMarkdown={"```ts\nconst a = 1;\n```"} spaceId="sp1" />);
    const select = await screen.findByRole("combobox", { name: "코드 언어" });
    expect(select).toHaveTextContent("ts");
    await chooseOption(user, select, "python");
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
    render(<WikiEditor initialMarkdown={"```ts\nconst a = 1;\n```"} spaceId="sp1" />);
    await user.click(await screen.findByRole("button", { name: "코드 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("const a = 1;"));
  });

  it("언어가 지정된 코드 블록은 lowlight가 붙인 hljs 토큰 span으로 렌더된다", async () => {
    const { container } = render(
      <WikiEditor initialMarkdown={"```ts\nconst a = 1;\n```"} spaceId="sp1" />,
    );
    await screen.findByLabelText("코드 언어");
    await waitFor(() => {
      expect(container.querySelector('span[class^="hljs-"]')).not.toBeNull();
    });
  });

  it("언어가 없는 코드 블록은 하이라이트 토큰 없이 렌더된다", async () => {
    const { container } = render(<WikiEditor initialMarkdown={"```\nconst a = 1;\n```"} spaceId="sp1" />);
    const select = await screen.findByRole("combobox", { name: "코드 언어" });
    expect(select).toHaveTextContent("plaintext");
    expect(container.querySelector('span[class^="hljs-"]')).toBeNull();
  });

  it("언어 목록은 검색으로 좁혀 고른다", async () => {
    const user = userEvent.setup();
    const ref = createRef<WikiEditorHandle>();
    render(<WikiEditor ref={ref} initialMarkdown={"```ts\nconst a = 1;\n```"} spaceId="sp1" />);
    await user.click(await screen.findByRole("combobox", { name: "코드 언어" }));
    await user.keyboard("pyth");
    await user.click(await screen.findByRole("option", { name: "python" }));
    expect(ref.current!.getMarkdown()).toContain("```python");
  });

  it("목록에 없는 저장된 언어도 선택지에 남아 값이 사라지지 않는다", async () => {
    const user = userEvent.setup();
    const ref = createRef<WikiEditorHandle>();
    render(<WikiEditor ref={ref} initialMarkdown={"```cobol-x\nX\n```"} spaceId="sp1" />);
    const select = await screen.findByRole("combobox", { name: "코드 언어" });
    expect(select).toHaveTextContent("cobol-x");
    expect((await optionNames(user, select))[0]).toBe("cobol-x");
    expect(ref.current!.getMarkdown()).toContain("```cobol-x");
  });
});
