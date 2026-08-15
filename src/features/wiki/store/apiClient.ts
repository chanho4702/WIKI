// src/features/wiki/store/apiClient.ts
// AuthGate와 스토어가 같은 auth 클라이언트(메모리 AT·refresh dedup)를 공유하도록 싱글톤으로 노출한다.
import { createAuthClient } from "../../../auth/client";

// baseUrl은 상대경로("")가 기본 — 프로덕션(nginx same-origin)과 dev 프록시(VITE_API_PROXY) 모두
// same-origin으로 동작해 CORS를 피한다. 직접 크로스-오리진으로 붙을 때만 VITE_API_BASE에 절대 URL을
// 넣는다(그 경우 게이트웨이 CORS + 쿠키 SameSite 설정 필요).
export const sharedAuthClient = createAuthClient({
  baseUrl: (import.meta.env.VITE_API_BASE as string) ?? "",
});

/**
 * 백엔드 모드 여부 — 프로덕션은 nginx same-origin 백엔드가 항상 존재한다.
 * dev만 VITE_API_PROXY/VITE_API_BASE가 없을 때 localStorage 목업으로 동작한다.
 */
export const USE_BACKEND =
  import.meta.env.PROD || Boolean(import.meta.env.VITE_API_PROXY) || Boolean(import.meta.env.VITE_API_BASE);

export const sharedApiFetch = sharedAuthClient.apiFetch;
