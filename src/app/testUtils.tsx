import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "./App";
/*
 * 편집 화면은 프로덕션에서 지연 로딩된다(번들 분리). 테스트에서는 그 동적 import가 테스트당
 * 5초 예산 안에서 일어나 병렬 실행 중에 간헐적으로 초과했다 — 여기서 미리 불러 모듈 캐시를
 * 데워 둔다. 앱 동작에는 영향이 없고, 테스트가 재는 것도 번들 크기가 아니다.
 */
import "../features/wiki/pages/PageEditPage";
import type { OrgMockState, PageNode, WikiData } from "../features/wiki/store/types";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { ReadOnlyProvider } from "../features/wiki/lib/readOnly";

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

/**
 * 목업 org 상태를 심는다(U4) — 전역 관리자 여부·승인 대기는 `wiki.v1`의 `org`가 정한다.
 * 아무것도 심지 않으면 "활성 전역 관리자"가 기본값이라, **비관리자·승인 대기 테스트만** 부른다.
 * 시드를 쓴 뒤에 호출한다(메모리 캐시를 함께 비운다).
 */
export function seedOrgState(org: OrgMockState): void {
  const raw = localStorage.getItem("wiki.v1");
  if (!raw) throw new Error("시드를 먼저 저장한 뒤 호출하세요");
  const data = JSON.parse(raw) as WikiData;
  localStorage.setItem("wiki.v1", JSON.stringify({ ...data, org }));
  __resetForTest();
}

export interface RenderAppOptions {
  /** 공개 문서(읽기 전용) 인스턴스로 렌더한다. 생략하면 빌드 기본값(팀 위키 = false). */
  readOnly?: boolean;
}

/** App 전체를 라우터+토스트로 감싸 렌더 — W1 App.test.tsx의 하네스 공용화 */
export function renderApp(initialPath = "/", options: RenderAppOptions = {}) {
  return render(
    <ToastProvider>
      <ReadOnlyProvider value={options.readOnly}>
        <MemoryRouter initialEntries={[initialPath]}>
          <App />
          <LocationProbe />
        </MemoryRouter>
      </ReadOnlyProvider>
    </ToastProvider>,
  );
}
