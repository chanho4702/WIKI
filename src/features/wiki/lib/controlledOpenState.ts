import { useEffect, useState } from "react";

/**
 * "반쪽 제어" 프롭 방지 공용 훅 (W7 T2) — EmojiPicker.tsx/SpaceCreateModal.tsx/TopToolbar.tsx가
 * 각자 `openProp ?? internalOpen` 식으로 반쪽만 와도 조용히 uncontrolled로 흘려보내던 것을
 * 하나의 판정으로 통일한다.
 *
 * - open과 onOpenChange가 둘 다 있으면 controlled: 그 값을 그대로 반환한다.
 * - 둘 다 없으면 uncontrolled: 내부 state로 관리한다(기존 동작과 동일).
 * - 한쪽만 있으면(대개 배선 실수) dev 콘솔에 한국어로 경고하고 uncontrolled로 폴백한다 —
 *   반쪽 프롭을 무시하고 조용히 동작이 어긋나는 것보다, 배선한 사람이 바로 알아채는 편이 낫다.
 */
export function useControlledOpenState(
  componentName: string,
  openProp: boolean | undefined,
  onOpenChangeProp: ((open: boolean) => void) | undefined,
): [boolean, (open: boolean) => void] {
  const [internalOpen, setInternalOpen] = useState(false);
  const hasOpen = openProp !== undefined;
  const hasOnOpenChange = onOpenChangeProp !== undefined;
  const controlled = hasOpen && hasOnOpenChange;

  useEffect(() => {
    if (hasOpen !== hasOnOpenChange) {
      console.warn(
        `${componentName}: open과 onOpenChange는 항상 함께 넘겨야 합니다 — 한쪽만 지정되어 내부 상태로 대체합니다.`,
      );
    }
  }, [componentName, hasOpen, hasOnOpenChange]);

  if (controlled) {
    return [openProp as boolean, onOpenChangeProp as (open: boolean) => void];
  }
  return [internalOpen, setInternalOpen];
}
