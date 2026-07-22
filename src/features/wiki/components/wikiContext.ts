import type { Page, Space } from "../store/types";

/**
 * 스페이스 라우트(`/spaces/:spaceId/*`)의 하위 페이지에 Outlet으로 전달하는 컨텍스트.
 * 이전엔 WikiLayout이 소유했으나, 글로벌 셸(AppShell)로 사이드바를 끌어올리면서 타입만 별도
 * 모듈로 분리했다 — AppShell이 스페이스 페이지를 로드해 이 컨텍스트를 제공하고, GlobalSidebar와
 * 페이지 화면(PageView/Edit/Index)이 같은 데이터를 공유한다.
 */
export interface WikiOutletContext {
  pages: Page[] | null;
  /** 현재 스페이스 (Breadcrumbs의 스페이스 이름 등) */
  space: Space;
  /** 페이지 생성/수정/삭제 후 사이드바 트리를 다시 로드한다 */
  reloadPages: () => Promise<void>;
}
