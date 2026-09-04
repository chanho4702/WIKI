// src/features/wiki/store/apiClient.ts
// AuthGate와 스토어가 같은 auth 클라이언트(메모리 AT·refresh dedup)를 공유하도록 싱글톤으로 노출한다.
import { createAuthClient } from "../../../auth/client";
import { READ_ONLY } from "../lib/readOnly";

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(/\/+$/, "");

function prefixOf(raw: string | undefined, fallback: string): string {
  const trimmed = (raw ?? "").replace(/\/+$/, "");
  return trimmed || fallback;
}

/**
 * API 경로 접두사 — 인스턴스마다 게이트웨이 앞단의 라우팅이 다르다(설계 §2.2).
 *
 * 팀 위키는 기본값(`/api/wiki`·`/api/search`)이라 무변경이고, 공개 문서 인스턴스는 nginx가
 * `/api/docs/`를 자기 백엔드로 직접 프록시하므로 여기서 한 번만 바꿔 끼운다. wikiApi의 76곳이
 * 넘는 경로 리터럴을 건드리지 않는 이유이기도 하다 — 치환점이 여러 곳이면 반드시 하나가 샌다.
 */
export const WIKI_API_PREFIX = prefixOf(import.meta.env.VITE_WIKI_API_PREFIX as string | undefined, "/api/wiki");
export const SEARCH_API_PREFIX = prefixOf(
  import.meta.env.VITE_SEARCH_API_PREFIX as string | undefined,
  "/api/search",
);

/**
 * 호출부가 쓰는 정규 경로(`/api/wiki/...`·`/api/search/...`)를 이 인스턴스의 실제 경로로 바꾼다.
 * `/api/me`·`/api/org/...`·`/api/auth/...`처럼 플랫폼 공통 경계는 그대로 둔다.
 */
export function resolveApiPath(path: string): string {
  if (path === "/api/wiki" || path.startsWith("/api/wiki/")) {
    return WIKI_API_PREFIX + path.slice("/api/wiki".length);
  }
  if (path === "/api/search" || path.startsWith("/api/search/")) {
    return SEARCH_API_PREFIX + path.slice("/api/search".length);
  }
  return path;
}

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

/**
 * 로그인 게이트를 켤지 — AuthGate의 기본값이자 앱에서 로그인 리다이렉트가 일어나는 유일한 조건.
 * 공개 문서 인스턴스는 로그인 자체가 없으므로(익명 GET만 허용) 프로덕션 빌드여도 끈다.
 */
export const AUTH_GATE_ENABLED = (import.meta.env.PROD || USE_BACKEND) && !READ_ONLY;

/** 모든 스토어 요청의 단일 통로 — 여기서만 인스턴스별 경로 접두사를 적용한다. */
export const sharedApiFetch = (path: string, init?: RequestInit): Promise<Response> =>
  sharedAuthClient.apiFetch(resolveApiPath(path), init);

/**
 * collaboration-service 전용 1회 ticket 경계. 일반 apiFetch를 쓰면 메모리 Access Token이
 * Authorization을 덮어쓰고, 401 refresh가 이미 소비된 ticket을 재전송하므로 별도 함수로 둔다.
 */
export function sharedCollaborationFetch(
  path: string,
  ticket: string,
  init: Omit<RequestInit, "headers"> & { headers?: HeadersInit } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Collaboration ${ticket}`);
  return fetch(`${API_BASE}${resolveApiPath(path)}`, {
    ...init,
    headers,
    // 이 경계의 유일한 자격 증명은 1회용 ticket이다. 같은 origin의 로그인 쿠키도 싣지 않는다.
    credentials: "omit",
    cache: "no-store",
  });
}

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
    xhr.open("POST", `${API_BASE}${resolveApiPath(path)}`);
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
