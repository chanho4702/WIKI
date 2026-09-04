import "@chanho/tokens/css";
import "@chanho/react/styles.css";
// KaTeX 기본 스타일(W27-2) — 수식 조판은 이 CSS 없이는 겹쳐 보인다. 폰트는 Vite가 함께 번들한다.
import "katex/dist/katex.min.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "./App";
import { initTheme } from "./theme";
import { AuthGate } from "../auth/AuthGate";
import { ReadOnlyProvider } from "../features/wiki/lib/readOnly";

// 렌더 전에 저장된 테마를 적용해 첫 페인트 깜빡임을 막는다
initTheme();

/**
 * 라우터 basename은 Vite base에서 파생한다 — 전에는 "/wiki"가 하드코딩돼 있어 base만 바꾸면
 * 자산은 새 경로에서 오는데 라우팅은 옛 경로를 기대하는 상태가 될 수 있었다(설계 §2.2).
 */
const basename = import.meta.env.BASE_URL.replace(/\/+$/, "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <AuthGate>
        <ReadOnlyProvider>
          <BrowserRouter basename={basename}>
            <App />
          </BrowserRouter>
        </ReadOnlyProvider>
      </AuthGate>
    </ToastProvider>
  </StrictMode>,
);
