import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    css: true,
    // 로컬 .env(백엔드 모드)와 무관하게 테스트는 항상 목업 모드로 고정한다.
    // (Vite가 .env를 로드해 import.meta.env에 주입하므로, 여기서 명시적으로 비워 USE_BACKEND=false 보장.)
    // 읽기 전용 플래그도 비운다 — 로컬 .env가 켜 두면 기존 통합 테스트가 통째로 흔들린다.
    env: { VITE_API_BASE: "", VITE_API_PROXY: "", VITE_WIKI_READONLY: "" },
    // TipTap 에디터를 마운트하는 통합 테스트는 jsdom에서 단독 실행만으로도 3~4초가 걸린다.
    // 기본값 5초는 병렬 실행 부하가 겹치면 넘겨서, 로직과 무관하게 산발적으로 실패했다
    // (레이어 분할 노드가 스키마에 추가되며 경계를 넘음). 여유를 준다.
    testTimeout: 20000,
    // 워커를 코어 수만큼 띄우면 jsdom 렌더가 서로 CPU를 뺏어 대기 상한을 넘긴다(2026-08-29 실측).
    // 절반으로 묶으면 전체 시간은 비슷하면서 개별 테스트가 굶지 않는다.
    poolOptions: { threads: { maxThreads: 6 } },
  },
});
