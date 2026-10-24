/**
 * 목업 응답 지연(개발 전용) — 목업은 즉시 resolve해서 로딩 화면(스켈레톤)을 눈으로 볼 틈이 없다.
 * `?mockDelay=1500`(ms)로 열면 그 값을 이 탭(sessionStorage)에 기억하고, 목업 함수의 Promise 결과를 그만큼
 * 늦게 돌려준다. `?mockDelay=0`이면 끈다.
 *
 * vitest(MODE=test)와 프로덕션 빌드에서는 켜지지 않는다 — 호출부(wikiStore)가 `import.meta.env.DEV`와
 * 함께 판정하므로 프로덕션 번들에서는 이 분기 자체가 빠진다. 계약(반환값·의미론)은 그대로이고 시점만 늦다.
 */
const KEY = "wiki.dev.mockDelay";

export function readMockDelay(): number {
  if (typeof window === "undefined") return 0;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("mockDelay");
    if (fromUrl !== null) sessionStorage.setItem(KEY, fromUrl);
    const ms = Number(sessionStorage.getItem(KEY) ?? 0);
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  } catch {
    return 0;
  }
}

export function withMockDelay<T extends object>(impl: T, ms: number): T {
  if (ms <= 0) return impl;
  return new Proxy(impl, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = (value as (...a: unknown[]) => unknown).apply(target, args);
        if (!(result instanceof Promise)) return result;
        return result.then(
          (v) => new Promise((resolve) => setTimeout(() => resolve(v), ms)),
          (e) => new Promise((_, reject) => setTimeout(() => reject(e), ms)),
        );
      };
    },
  });
}
