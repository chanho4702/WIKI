import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SidebarResizer } from "./SidebarResizer";

/**
 * jsdom은 setPointerCapture/hasPointerCapture/releasePointerCapture를 구현하지 않고(컴포넌트
 * 쪽에서 옵셔널 체이닝으로 방어 — SidebarResizer.tsx 참고), fireEvent.pointerDown/Move가
 * clientX를 합성 이벤트로 전달하지 않는다(확인됨 — 네이티브 PointerEvent init dict 제약).
 * 그래서 정확한 픽셀 계산은 검증하지 않고, "onDrag가 마지막으로 보여준 값과 동일한 값으로
 * onCommit이 호출되는지"(드리프트 없음) + "dragRef가 리셋되어 이후 move가 무시되는지"만
 * 검증한다 — 드래그 좌표 자체는 clampSidebarWidth 유닛 테스트가 이미 커버한다.
 */
describe("SidebarResizer — pointercancel", () => {
  it("드래그 도중 pointercancel이 오면 dragRef를 리셋하고, 마지막으로 보여준 폭을 그대로 커밋한다", () => {
    const onDrag = vi.fn();
    const onCommit = vi.fn();
    render(<SidebarResizer width={288} onDrag={onDrag} onCommit={onCommit} />);
    const resizer = screen.getByRole("separator", { name: "사이드바 너비 조절" });

    fireEvent.pointerDown(resizer, { pointerId: 1 });
    fireEvent.pointerMove(resizer, { pointerId: 1 });
    expect(onDrag).toHaveBeenCalledTimes(1);
    const lastPreview = onDrag.mock.calls[0][0];
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.pointerCancel(resizer, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(lastPreview);

    // dragRef가 리셋되었으므로 취소 후 이어지는 move는 더 이상 드래그로 취급되지 않는다
    onDrag.mockClear();
    fireEvent.pointerMove(resizer, { pointerId: 1 });
    expect(onDrag).not.toHaveBeenCalled();
  });

  it("pointerup으로 정상 종료된 뒤 pointercancel이 와도 다시 commit되지 않는다", () => {
    const onDrag = vi.fn();
    const onCommit = vi.fn();
    render(<SidebarResizer width={288} onDrag={onDrag} onCommit={onCommit} />);
    const resizer = screen.getByRole("separator", { name: "사이드바 너비 조절" });

    fireEvent.pointerDown(resizer, { pointerId: 1 });
    fireEvent.pointerMove(resizer, { pointerId: 1 });
    fireEvent.pointerUp(resizer, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);

    fireEvent.pointerCancel(resizer, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1); // 늘어나지 않는다 — dragRef가 이미 비어 있다
  });

  it("드래그를 시작하지 않은 채(dragRef 없음) pointercancel만 와도 onCommit을 호출하지 않는다", () => {
    const onDrag = vi.fn();
    const onCommit = vi.fn();
    render(<SidebarResizer width={288} onDrag={onDrag} onCommit={onCommit} />);
    const resizer = screen.getByRole("separator", { name: "사이드바 너비 조절" });

    fireEvent.pointerCancel(resizer, { pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onDrag).not.toHaveBeenCalled();
  });
});
