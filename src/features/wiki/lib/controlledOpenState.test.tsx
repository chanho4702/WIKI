import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useControlledOpenState } from "./controlledOpenState";

/** EmojiPicker/SpaceCreateModal/TopToolbar가 각자 겪는 반쪽 제어 판정을 하네스로 직접 검증한다
 * (useDismissablePopover.test.tsx와 동일한 하네스 패턴). */
function Harness({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [resolvedOpen, setResolvedOpen] = useControlledOpenState("Harness", open, onOpenChange);
  return (
    <div>
      <span data-testid="resolved-open">{String(resolvedOpen)}</span>
      <button type="button" onClick={() => setResolvedOpen(!resolvedOpen)}>
        토글
      </button>
    </div>
  );
}

describe("useControlledOpenState", () => {
  it("둘 다 없으면(uncontrolled) 내부 state로 시작하고 토글이 반영된다", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByTestId("resolved-open")).toHaveTextContent("false");
    await user.click(screen.getByRole("button", { name: "토글" }));
    expect(screen.getByTestId("resolved-open")).toHaveTextContent("true");
  });

  it("둘 다 있으면(controlled) 외부 값을 그대로 반영하고, setter는 onOpenChange로 위임한다", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness open onOpenChange={onOpenChange} />);
    expect(screen.getByTestId("resolved-open")).toHaveTextContent("true");
    await user.click(screen.getByRole("button", { name: "토글" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // controlled이므로 호출자가 리렌더링하기 전까지 내부 표시값은 그대로 외부 open(true)을 반영한다
    expect(screen.getByTestId("resolved-open")).toHaveTextContent("true");
  });

  it("open만 있고 onOpenChange가 없으면 콘솔 경고를 내고 내부 state로 폴백한다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<Harness open />);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Harness"));
    // 폴백이므로 open=true를 반영하지 않고 내부 초기값 false로 시작한다
    expect(screen.getByTestId("resolved-open")).toHaveTextContent("false");
    warnSpy.mockRestore();
  });

  it("onOpenChange만 있고 open이 없으면 콘솔 경고를 낸다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<Harness onOpenChange={() => {}} />);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Harness"));
    warnSpy.mockRestore();
  });
});
