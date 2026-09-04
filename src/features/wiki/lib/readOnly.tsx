import { createContext, useContext } from "react";
import type { ReactNode } from "react";

/**
 * 읽기 전용(공개 문서) 모드 — 빌드 타임 플래그(설계 §2.2).
 *
 * `pnpm build --mode docs`(`.env.docs`)로 만든 산출물만 true다. 팀 위키 빌드는 변수를 주지
 * 않으므로 false — 기존 동작이 그대로 기본값이다. 런타임 권한 판정이 아니라 **인스턴스 성격**이라
 * 빌드 상수로 둔다(공개 인스턴스에서는 서버도 쓰기를 전부 403으로 막는다 — 화면 숨김은 이중 방어).
 */
export const READ_ONLY = import.meta.env.VITE_WIKI_READONLY === "true";

const ReadOnlyContext = createContext<boolean>(READ_ONLY);

/**
 * 테스트가 플래그를 주입하는 통로. 값을 주지 않으면 빌드 상수를 그대로 쓴다 —
 * provider를 안 감싼 기존 테스트/화면도 같은 기본값(false)을 본다.
 */
export function ReadOnlyProvider({ value, children }: { value?: boolean; children: ReactNode }) {
  return <ReadOnlyContext.Provider value={value ?? READ_ONLY}>{children}</ReadOnlyContext.Provider>;
}

/** 화면이 쓰기 어포던스를 숨길지 판단하는 단일 진입점. */
export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
