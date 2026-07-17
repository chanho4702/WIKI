import { useCallback, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, clampSidebarWidth } from "../lib/sidebarPrefs";

const KEYBOARD_STEP = 16;

export interface SidebarResizerProps {
  /** 현재 표시 폭(px) — 키보드 조절과 드래그 시작 기준값 */
  width: number;
  /** 드래그 중 실시간 미리보기 — 저장하지 않고 화면 표시만 갱신한다 */
  onDrag: (px: number) => void;
  /** 드래그 종료(pointerup) 또는 키보드 조작 확정 — 여기서만 localStorage에 저장한다 */
  onCommit: (px: number) => void;
}

/**
 * 사이드바 우측 경계의 세로 리사이즈 핸들 (컨플루언스식).
 * pointerdown에서 포인터를 캡처하고, pointermove에서 clampSidebarWidth로 폭을 계산해
 * onDrag(미저장 미리보기)로 넘긴다. pointerup에서 마지막 폭을 onCommit(영속 저장)으로 확정한다.
 * 키보드 ←/→는 16px 단위로 즉시 onCommit한다(드래그 없는 단발 조작이므로 미리보기 단계가 없다).
 */
export function SidebarResizer({ width, onDrag, onCommit }: SidebarResizerProps) {
  // pointermove 동안 갱신되는 "마지막 폭"을 pointerup 시점에 그대로 커밋하기 위한 보관소.
  // width prop은 드래그 도중에도 부모가 재렌더하며 바뀌므로, 클로저 캡처 대신 ref로 최신값을 추적한다.
  const dragRef = useRef<{ startX: number; startWidth: number; lastWidth: number } | null>(null);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // 실제 브라우저에서는 항상 존재하지만, jsdom(테스트 환경)은 미구현이라 옵셔널 체이닝으로
      // 방어한다 — 없어도 드래그 상태 추적(dragRef)만으로 로직은 동일하게 동작한다.
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = { startX: event.clientX, startWidth: width, lastWidth: width };
    },
    [width],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragRef.current;
      if (!state) return;
      const next = clampSidebarWidth(state.startWidth + (event.clientX - state.startX));
      state.lastWidth = next;
      onDrag(next);
    },
    [onDrag],
  );

  // pointerup(정상 종료)과 pointercancel(브라우저가 제스처를 가로채는 등 비정상 종료) 모두
  // 같은 방식으로 마무리한다 — dragRef를 리셋하고, 사용자가 마지막으로 본 폭을 그대로 커밋한다.
  // 여기서 롤백(시작 폭으로 되돌림) 대신 커밋을 택한 이유: pointercancel 후에도 화면에는 이미
  // onDrag로 갱신된 미리보기 폭이 보이고 있으므로, 조용히 되돌리면 "화면과 실제 저장값이 다른"
  // 더 혼란스러운 상태가 된다.
  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragRef.current;
      dragRef.current = null;
      if (!state) return;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      onCommit(state.lastWidth);
    },
    [onCommit],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onCommit(clampSidebarWidth(width - KEYBOARD_STEP));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onCommit(clampSidebarWidth(width + KEYBOARD_STEP));
      }
    },
    [width, onCommit],
  );

  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="사이드바 너비 조절"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    />
  );
}
