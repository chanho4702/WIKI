import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// CI(2코어) 러너에서는 스페이스 생성→라우팅→렌더가 findBy*/waitFor 기본 대기 1s를
// 간헐적으로 넘긴다(App.test.tsx W1 EmptyState, CI 2연속 실패·로컬 420 green 실측).
//
// 2026-08-29 지연 트리 이후 화면마다 마운트 시 서버 조회가 여러 번 일어나면서(트리·조상·
// 하위·라벨·첨부·구독) 5s 상한도 병렬 부하에서 간헐적으로 걸렸다 — 매번 다른 테스트가
// "요소를 못 찾음"으로 떨어졌다. 로직 문제가 아니라 CPU 경합이라 상한을 올린다.
// 상한만 올리는 것이라 통과하는 테스트는 조건 충족 즉시 반환된다(로컬 속도 영향 없음).
configure({ asyncUtilTimeout: 10000 });

afterEach(() => {
  cleanup();
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  window.HTMLElement.prototype.releasePointerCapture = () => {};
}
// jsdom은 레이아웃 엔진이 없어 elementsFromPoint를 구현하지 않는다 —
// tiptap-extension-global-drag-handle의 mousemove 핸들러가 이를 호출해 미구현 시
// 테스트 실행 중 uncaught TypeError를 던진다. 빈 배열을 반환하면 해당 핸들러는
// 대상 노드를 찾지 못해 조용히 no-op — jsdom에서는 드래그 핸들이 좌표 기반으로
// 동작하지 않아도(실제 드래그 동작은 브라우저 전용) 무방하다.
if (!document.elementsFromPoint) {
  document.elementsFromPoint = () => [];
}
