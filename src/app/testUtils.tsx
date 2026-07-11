import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "./App";

/** 현재 pathname을 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/** App 전체를 라우터+토스트로 감싸 렌더 — W1 App.test.tsx의 하네스 공용화 */
export function renderApp(initialPath = "/") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}
