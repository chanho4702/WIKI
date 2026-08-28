import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "./App";
import type { PageNode } from "../features/wiki/store/types";

/** 현재 pathname을 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

/**
 * 스페이스의 모든 페이지 — **테스트 전용**(2026-08-29).
 *
 * 전량 조회 API는 제거했다(그 조회 자체가 규모 상한이었다). 테스트는 상태를 통째로 확인하고
 * 싶을 때가 많아, 지연 트리 API를 재귀로 훑어 같은 목록을 만든다.
 */
export async function allPagesForTest(spaceId: string): Promise<PageNode[]> {
  const { listChildren } = await import("../features/wiki/store/wikiStore");
  const out: PageNode[] = [];
  const walk = async (parentId: string | null) => {
    for (const node of await listChildren(spaceId, parentId)) {
      out.push(node);
      if (node.childCount > 0) await walk(node.id);
    }
  };
  await walk(null);
  return out;
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
