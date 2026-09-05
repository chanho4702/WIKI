import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// VITE_API_PROXY를 설정하면(예: http://localhost:18000) dev 서버가 /api·/oauth2·/login 을 게이트웨이로
// 프록시한다 — 브라우저는 same-origin(5174)으로 요청하므로 CORS/쿠키 문제가 없다(프로덕션 nginx와 동일 방식).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const proxyTarget = env.VITE_API_PROXY;

  return {
    // nginx 경로 기반 통합 배포: http://localhost/wiki/ 아래에서 서빙된다.
    // 공개 문서 인스턴스는 `--mode docs`(.env.docs)로 /docs/ 아래에 같은 앱을 올린다 — BrowserRouter
    // basename은 이 값에서 파생하므로(main.tsx) 둘이 어긋날 수 없다.
    base: env.VITE_BASE || "/wiki/",
    plugins: [react()],
    // 앱과 `@chanho/org-admin`이 같은 react-router 한 벌을 봐야 한다 - 갈리면 라우터 컨텍스트가 둘이 된다
    resolve: { dedupe: ["react", "react-dom", "react-router"] },
    server: proxyTarget
      ? {
          proxy: {
            "/api": { target: proxyTarget, changeOrigin: true, ws: true },
            "/oauth2": { target: proxyTarget, changeOrigin: true },
            "/login": { target: proxyTarget, changeOrigin: true },
          },
        }
      : undefined,
  };
});
