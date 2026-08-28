import type { Space } from "../store/types";

/**
 * 스페이스 라우트(`/spaces/:spaceId/*`)의 하위 페이지에 Outlet으로 전달하는 컨텍스트.
 * 이전엔 WikiLayout이 소유했으나, 글로벌 셸(AppShell)로 사이드바를 끌어올리면서 타입만 별도
 * 모듈로 분리했다.
 *
 * 2026-08-29부터 **페이지 목록은 여기 없다**. 사이드바가 지연 트리로 바뀌면서 "스페이스의 전
 * 페이지"라는 것이 화면에 존재하지 않게 됐다 — 목록이 필요한 화면은 각자 필요한 만큼 서버에 묻는다.
 */
export interface WikiOutletContext {
  /** 현재 스페이스 (Breadcrumbs의 스페이스 이름 등) */
  space: Space;
  /**
   * 페이지 생성/수정/삭제 후 사이드바 트리를 다시 로드한다.
   * 지연 트리(2026-08-29)라 "펼쳐 둔 자리"만 다시 읽는다 — 화면은 더 이상 스페이스 전
   * 페이지를 들고 있지 않으므로, 목록이 필요한 화면은 각자 서버에 묻는다.
   */
  reloadPages: () => Promise<void>;
}
