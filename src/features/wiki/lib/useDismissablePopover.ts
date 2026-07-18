import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

export interface UseDismissablePopoverOptions<
  TContainer extends HTMLElement = HTMLElement,
  TTrigger extends HTMLElement = HTMLElement,
> {
  /** 트리거 버튼 + 팝오버 패널을 함께 감싸는 컨테이너 ref — 항상 마운트돼 있어야 한다(패널만
   * open일 때 조건부 렌더). 외부 클릭/포커스 이탈 판정 기준이 된다. */
  containerRef: RefObject<TContainer | null>;
  /** Escape로 닫힐 때 포커스를 되돌릴 트리거 버튼 ref. */
  triggerRef: RefObject<TTrigger | null>;
  open: boolean;
  /** 팝오버를 닫는다(상태 초기화만 — 포커스는 이 훅이 필요한 경우에만 별도로 옮긴다). */
  onClose: () => void;
}

/**
 * 팝오버 닫힘 공용 훅 (W7 T1) — InsertMenu/EmojiPicker/WikiLayout(SpaceFlyout 배선)에 각각
 * 중복돼 있던 "외부 클릭 → 닫기", "Escape → 닫기 + 트리거 재포커스" 리스너를 하나로 모으고,
 * 새로 "Tab-out(포커스가 컨테이너 밖으로 나감) → 닫기"를 추가한다.
 *
 * - 외부 mousedown: 포커스를 건드리지 않는다(InsertMenu.tsx W6-T2 확정 패턴 — preventDefault 없이
 *   닫기만 해서, 클릭 대상(다른 버튼, 에디터 본문 등)이 자연스럽게 포커스/캐럿을 받도록 둔다).
 * - Escape: 컨테이너 전체에 keydown으로 바인딩한다(기존엔 필터 input에만 걸려 있어서, 컨테이너
 *   안의 다른 요소 — 예: SpaceFlyout의 별표 버튼 — 에 포커스가 가 있으면 Escape가 먹지 않는 갭이
 *   있었다). 닫은 뒤 트리거로 포커스를 되돌려 키보드 사용자가 위치를 잃지 않게 한다.
 * - focusout(Tab-out): 컨테이너 안의 포커스가 relatedTarget 기준으로 컨테이너 "밖"으로 나가면
 *   닫는다. 외부 클릭과 달리 여기서도 포커스를 다시 강탈하지 않는다 — 브라우저가 이미 다음 요소로
 *   옮긴 포커스를 그대로 두어, Tab의 자연스러운 진행을 막지 않는다.
 *
 * 실 브라우저에서는 외부 클릭 시 mousedown과 focusout이 같은 틱에 함께 발화해 onClose가 중복
 * 호출될 수 있다 — "이번 열림 세션"에서 이미 닫음 처리를 했으면 이후 호출은 no-op으로 무시한다
 * (closedRef 가드, open이 다시 true가 될 때 리셋).
 */
export function useDismissablePopover<
  TContainer extends HTMLElement = HTMLElement,
  TTrigger extends HTMLElement = HTMLElement,
>({ containerRef, triggerRef, open, onClose }: UseDismissablePopoverOptions<TContainer, TTrigger>): void {
  const closedRef = useRef(false);

  useEffect(() => {
    if (open) closedRef.current = false;
  }, [open]);

  const guardedClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }, [onClose]);

  // 외부 mousedown → 닫기만(포커스 불간섭)
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        guardedClose();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, guardedClose, containerRef]);

  // Escape → 닫기 + 트리거 재포커스 (컨테이너 전체 keydown — input 한정이 아님)
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      guardedClose();
      triggerRef.current?.focus();
    };
    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [open, guardedClose, containerRef, triggerRef]);

  // focusout(Tab-out) → 닫기만(포커스 불간섭) — relatedTarget이 컨테이너 밖이면 나간 것으로 본다
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    const handleFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && container.contains(next)) return;
      guardedClose();
    };
    container.addEventListener("focusout", handleFocusOut);
    return () => container.removeEventListener("focusout", handleFocusOut);
  }, [open, guardedClose, containerRef]);
}
