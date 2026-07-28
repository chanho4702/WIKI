import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteContentDialog } from "./DeleteContentDialog";

function renderDialog(props: Partial<React.ComponentProps<typeof DeleteContentDialog>> = {}) {
  const onConfirm = vi.fn();
  render(
    <DeleteContentDialog
      open
      onOpenChange={() => {}}
      title="개발 환경 설정"
      type="folder"
      childCount={0}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onConfirm };
}

describe("DeleteContentDialog — 자식 처리 선택(기획 P2)", () => {
  it("자식이 없으면 선택지 없이 확인만 묻고, 옵션 없이 삭제한다", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ childCount: 0 });

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "삭제" }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("자식이 있으면 처리 방식 두 가지를 제시하고 기본값은 '상위로 올리기'다", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ childCount: 3 });

    // 파괴가 덜한 쪽이 기본값이어야 한다 — 확인만 연타해도 내용이 사라지지 않게
    const promote = screen.getByRole("radio", { name: /상위로 올리기/ });
    expect(promote).toBeChecked();
    expect(screen.getByRole("radio", { name: /함께 삭제/ })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "삭제" }));
    expect(onConfirm).toHaveBeenCalledWith({ children: "promote" });
  });

  it("'함께 삭제'를 고르면 cascade로 삭제한다", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ childCount: 3 });

    await user.click(screen.getByRole("radio", { name: /함께 삭제/ }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(onConfirm).toHaveBeenCalledWith({ children: "cascade" });
  });

  it("몇 개가 영향을 받는지 숫자로 알려준다 — '되돌릴 수 없다'만으로는 규모를 알 수 없다", () => {
    renderDialog({ childCount: 3 });
    expect(screen.getByRole("radiogroup", { name: /하위 항목 3개/ })).toBeInTheDocument();
  });

  it("페이지와 폴더의 문구가 각각의 낱말을 쓴다", () => {
    const { unmount } = render(
      <DeleteContentDialog
        open
        onOpenChange={() => {}}
        title="배포 가이드"
        type="page"
        childCount={0}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: "페이지 삭제" })).toBeInTheDocument();
    unmount();

    renderDialog({ type: "folder" });
    expect(screen.getByRole("dialog", { name: "폴더 삭제" })).toBeInTheDocument();
  });
});
