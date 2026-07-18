import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDismissablePopover } from "./useDismissablePopover";

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDismissablePopover({ containerRef, triggerRef, open, onClose });
  return (
    <div>
      <div className="harness-container" ref={containerRef}>
        <button ref={triggerRef} type="button">
          트리거
        </button>
        {open && (
          <div className="harness-popover">
            <input type="text" placeholder="필터" />
            <button type="button" tabIndex={-1}>
              항목
            </button>
          </div>
        )}
      </div>
      <button type="button">외부 버튼</button>
    </div>
  );
}

describe("useDismissablePopover", () => {
  it("컨테이너 밖 mousedown이면 onClose만 호출하고 포커스는 클릭 대상이 받는다", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    const outer = screen.getByRole("button", { name: "외부 버튼" });
    await user.click(outer);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outer).toHaveFocus();
  });

  it("컨테이너 안 mousedown이면 onClose가 호출되지 않는다", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    await user.click(screen.getByPlaceholderText("필터"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("컨테이너 내부 어디서든(필터 input이 아니어도) Escape를 누르면 onClose + 트리거 재포커스", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    const item = screen.getByRole("button", { name: "항목" });
    item.focus();
    fireEvent.keyDown(item, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "트리거" })).toHaveFocus();
  });

  it("Tab-out(focusout의 relatedTarget이 컨테이너 밖)이면 onClose만 호출하고 포커스를 빼앗지 않는다", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    const input = screen.getByPlaceholderText("필터");
    const outer = screen.getByRole("button", { name: "외부 버튼" });
    fireEvent.focusOut(input, { relatedTarget: outer });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "트리거" })).not.toHaveFocus();
  });

  it("focusout의 relatedTarget이 컨테이너 안(예: 항목 버튼)이면 닫지 않는다", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    const input = screen.getByPlaceholderText("필터");
    const item = screen.getByRole("button", { name: "항목" });
    fireEvent.focusOut(input, { relatedTarget: item });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("open이 false면 아무 리스너도 동작하지 않는다", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open={false} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "외부 버튼" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  // 리뷰 근거 — 실 브라우저에서 외부 클릭 시 mousedown과 focusout이 같은 틱에 함께 발화해
  // onClose가 중복 호출될 수 있다. 훅은 "이번 열림 세션"에서 이미 닫힘 처리를 했으면 이후 호출을
  // no-op으로 무시해야 한다(closedRef 가드).
  it("같은 틱에 mousedown과 focusout이 함께 발화해도 onClose는 한 번만 호출된다(가드)", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    const input = screen.getByPlaceholderText("필터");
    const outer = screen.getByRole("button", { name: "외부 버튼" });
    fireEvent.mouseDown(outer);
    fireEvent.focusOut(input, { relatedTarget: outer });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
