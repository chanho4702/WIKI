// src/features/wiki/store/apiClient.ts
// AuthGate와 스토어가 같은 auth 클라이언트(메모리 AT·refresh dedup)를 공유하도록 싱글톤으로 노출한다.
import { createAuthClient } from "../../../auth/client";

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(/\/+$/, "");

// baseUrl은 상대경로("")가 기본 — 프로덕션(nginx same-origin)과 dev 프록시(VITE_API_PROXY) 모두
// same-origin으로 동작해 CORS를 피한다. 직접 크로스-오리진으로 붙을 때만 VITE_API_BASE에 절대 URL을
// 넣는다(그 경우 게이트웨이 CORS + 쿠키 SameSite 설정 필요).
export const sharedAuthClient = createAuthClient({
  baseUrl: API_BASE,
});

/**
 * 백엔드 모드 여부 — 프로덕션은 nginx same-origin 백엔드가 항상 존재한다.
 * dev만 VITE_API_PROXY/VITE_API_BASE가 없을 때 localStorage 목업으로 동작한다.
 */
export const USE_BACKEND =
  import.meta.env.PROD || Boolean(import.meta.env.VITE_API_PROXY) || Boolean(import.meta.env.VITE_API_BASE);

export const sharedApiFetch = sharedAuthClient.apiFetch;

export interface ApiUploadOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

function parseXhrHeaders(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.trim().split(/[\r\n]+/)) {
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return headers;
}

function xhrUpload(path: string, body: FormData, options: ApiUploadOptions): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException("업로드가 취소되었습니다.", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => options.signal?.removeEventListener("abort", abort);
    xhr.open("POST", `${API_BASE}${path}`);
    xhr.withCredentials = true;
    const accessToken = sharedAuthClient.getAccessToken();
    if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    xhr.addEventListener("load", () => {
      cleanup();
      resolve(new Response(xhr.responseText || null, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: parseXhrHeaders(xhr.getAllResponseHeaders()),
      }));
    });
    xhr.addEventListener("error", () => {
      cleanup();
      reject(new Error("이미지 업로드 중 네트워크 연결이 끊겼습니다."));
    });
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("업로드가 취소되었습니다.", "AbortError"));
    });
    options.signal?.addEventListener("abort", abort, { once: true });
    options.onProgress?.(0);
    xhr.send(body);
  });
}

/** XHR 업로드도 일반 API와 같은 메모리 AT·401 refresh 1회 재시도 규칙을 사용한다. */
export async function sharedApiUpload(
  path: string,
  body: FormData,
  options: ApiUploadOptions = {},
): Promise<Response> {
  let response = await xhrUpload(path, body, options);
  if (response.status === 401 && !options.signal?.aborted && (await sharedAuthClient.tryRefresh())) {
    response = await xhrUpload(path, body, options);
  }
  return response;
}
