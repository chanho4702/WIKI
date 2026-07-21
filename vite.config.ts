import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// VITE_API_PROXY를 설정하면(예: http://localhost:18000) dev 서버가 /api·/oauth2·/login 을 게이트웨이로
// 프록시한다 — 브라우저는 same-origin(5174)으로 요청하므로 CORS/쿠키 문제가 없다(프로덕션 nginx와 동일 방식).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const proxyTarget = env.VITE_API_PROXY;

  return {
    // nginx 경로 기반 통합 배포: http://localhost/wiki/ 아래에서 서빙된다
    base: "/wiki/",
    plugins: [react()],
    server: proxyTarget
      ? {
          proxy: {
            "/api": { target: proxyTarget, changeOrigin: true },
            "/oauth2": { target: proxyTarget, changeOrigin: true },
            "/login": { target: proxyTarget, changeOrigin: true },
          },
        }
      : undefined,
  };
});
