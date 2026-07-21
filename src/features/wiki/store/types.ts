export interface User {
  id: string;
  name: string;
}

export interface Space {
  id: string;
  key: string; // "DEV" 같은 대문자 접두어, 중복 금지
  name: string;
  description?: string;
  createdAt: string;
}

export interface Page {
  id: string;
  spaceId: string;
  parentId: string | null; // null = 루트 페이지
  title: string;
  body: string; // 마크다운 원문
  version: number; // 낙관적 락 카운터(백엔드 연동). 목업은 항상 1.
  position: number; // 형제 내 정렬 (생성순 max+1)
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageVersion {
  id: string;
  pageId: string;
  version: number; // 1부터 증가
  title: string;
  body: string; // 그 시점의 내용
  savedBy: string;
  savedAt: string;
}

export interface Comment {
  id: string;
  pageId: string;
  authorId: string;
  body: string;
  parentId: string | null; // null = 최상위, 값 있으면 답글 (중첩 1단 제한)
  createdAt: string;
  updatedAt: string | null; // 수정된 적 없으면 null — "(수정됨)" 표시 근거
}

/** localStorage `wiki.v1`에 저장되는 루트 구조 */
export interface WikiData {
  users: User[];
  spaces: Space[];
  pages: Page[];
  versions: PageVersion[];
  comments: Comment[];
}
