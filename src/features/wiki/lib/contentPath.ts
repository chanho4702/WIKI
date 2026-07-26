import type { Page } from "../store/types";

/**
 * 콘텐츠 항목의 라우트 경로. 폴더와 페이지는 여는 화면이 다르다 —
 * 폴더는 본문 대신 자식 목록(FolderPage), 페이지는 문서 보기(PageViewPage).
 *
 * 트리·개요·하위목록 등 여러 화면이 같은 링크를 만들므로 여기 하나로 모은다.
 * 한 곳이라도 `/pages/{id}`로 하드코딩하면 폴더를 눌렀을 때 빈 문서가 열린다.
 */
export function contentPath(page: Pick<Page, "id" | "spaceId" | "type">): string {
  return page.type === "folder"
    ? `/spaces/${page.spaceId}/folder/${page.id}`
    : `/spaces/${page.spaceId}/pages/${page.id}`;
}

/** spaceId를 별도로 아는 화면용(트리처럼 page.spaceId가 비어 있을 수 있는 백엔드 모드 대비). */
export function contentPathIn(spaceId: string, page: Pick<Page, "id" | "type">): string {
  return page.type === "folder"
    ? `/spaces/${spaceId}/folder/${page.id}`
    : `/spaces/${spaceId}/pages/${page.id}`;
}
