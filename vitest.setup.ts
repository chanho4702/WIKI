import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

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
