import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@chanho/react";
import { SpaceCreateModal } from "./SpaceCreateModal";

/** useToast()가 ToastProvider 컨텍스트를 요구하므로 감싸서 렌더한다(main.tsx/testUtils.tsx와 동일) */
function renderModal(props: Partial<React.ComponentProps<typeof SpaceCreateModal>> = {}) {
  return render(
    <ToastProvider>
      <SpaceCreateModal onCreated={() => {}} {...props} />
    </ToastProvider>,
  );
}

describe("SpaceCreateModal — 프롭 계약(W7 T2)", () => {
  it("open/onOpenChange 미지정 시(uncontrolled) 트리거로 열 수 있다 — 기존 EmptySpaces.tsx 등 사용처 회귀 방지", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "새 스페이스" }));
    expect(screen.getByLabelText("이름")).toBeInTheDocument();
  });

  it("open/onOpenChange를 함께(controlled) 넘기면 경고 없이 정상 동작한다 — WikiLayout.tsx 배선과 동일 패턴", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderModal({ open: true, onOpenChange: () => {} });
    expect(screen.getByLabelText("이름")).toBeInTheDocument();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // 반쪽 제어 방지 — EmojiPicker.test.tsx/TopToolbar.test.tsx와 동일한 계약 검증
  it("open만 넘기고 onOpenChange를 빠뜨리면 콘솔 경고를 낸다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderModal({ open: true });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SpaceCreateModal"));
    warnSpy.mockRestore();
  });

  it("onOpenChange만 넘기고 open을 빠뜨리면 콘솔 경고를 낸다", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderModal({ onOpenChange: () => {} });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SpaceCreateModal"));
    warnSpy.mockRestore();
  });
});
