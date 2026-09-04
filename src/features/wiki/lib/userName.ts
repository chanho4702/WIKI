import { useCallback } from "react";
import type { User } from "../store/types";
import { useReadOnly } from "./readOnly";

/**
 * 사용자 표시 이름 폴백. 백엔드 모드에선 wiki-backend가 사용자 이름을 주지 않아(숫자 id만)
 * 이름을 못 찾을 때 `사용자 #{id}`로 표기한다(설계 §4-1). 목업 모드는 실제 이름을 쓰므로 미사용.
 */
export function displayUserName(id: string): string {
  return `사용자 #${id}`;
}

/**
 * "누가"를 표시할 이름 — 읽기 전용(공개 문서)에서는 **항상 null**이다.
 *
 * 공개 인스턴스는 org 디렉터리(`/api/org/members`)를 부르지 않으므로 이름을 채울 방법이 없고,
 * 폴백을 그대로 두면 문서를 넣은 임포터 계정이 "사용자 #1"로 노출된다. 화면은 null을 받으면
 * "누가" 조각을 빼고 "언제"만 남긴다 — 표시 지점마다 조건을 복제하지 않도록 규칙을 여기 모은다.
 *
 * @returns (id, users, snapshot) → 표시할 이름, 없으면 null
 */
export function usePersonName(): (
  id: string | null | undefined,
  users: User[],
  snapshot?: string | null,
) => string | null {
  const readOnly = useReadOnly();
  return useCallback(
    (id, users, snapshot) => {
      if (readOnly) return null;
      if (!id) return snapshot ?? null;
      return users.find((u) => u.id === id)?.name ?? snapshot ?? displayUserName(id);
    },
    [readOnly],
  );
}
