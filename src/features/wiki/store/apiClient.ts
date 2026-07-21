// src/features/wiki/store/apiClient.ts
// AuthGate와 스토어가 같은 auth 클라이언트(메모리 AT·refresh dedup)를 공유하도록 싱글톤으로 노출한다.
import { createAuthClient } from "../../../auth/client";

/** 백엔드 모드일 때만 의미 있음. baseUrl = 게이트웨이(VITE_API_BASE). */
export const sharedAuthClient = createAuthClient({
  baseUrl: (import.meta.env.VITE_API_BASE as string) ?? "",
});

/** 백엔드 모드 여부 — VITE_API_BASE가 설정되면 실제 백엔드. */
export const USE_BACKEND = Boolean(import.meta.env.VITE_API_BASE);

export const sharedApiFetch = sharedAuthClient.apiFetch;
