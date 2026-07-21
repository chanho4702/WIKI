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
    env: { VITE_API_BASE: "", VITE_API_PROXY: "" },
  },
});
