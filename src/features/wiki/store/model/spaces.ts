// 스페이스·스페이스 권한 도메인 타입.

export interface Space {
  id: string;
  key: string; // 스페이스 구분 접두어(중복 금지). 목업은 대문자("DEV"), 백엔드 모드는 소문자 그대로 통과([a-z0-9-]+)
  name: string;
  description?: string;
  createdAt: string;
  /** 개인 스페이스의 주인(W23). 없으면 팀 스페이스. */
  ownerId?: string | null;
  /**
   * 스페이스 라벨(V41) — 디렉토리 분류. **문서 라벨(setLabels)과 다른 원장**이다: 스페이스 ADMIN이
   * 붙이고 디렉토리 필터만 읽는다. 이름 규칙은 문서 라벨과 같고 이름순(코드유닛)이다. 어댑터·목업은
   * 언제나 배열을 준다(없으면 빈 배열) — undefined는 이 필드 이전에 만든 테스트 픽스처뿐이다.
   */
  labels?: string[];
}

/**
 * 스페이스 멤버 권한 한 줄(org-service grant).
 * 주체는 사용자 또는 팀이고, 역할은 세 단계다 — 보기·편집·관리.
 */
export interface SpaceGrant {
  id: string;
  subjectType: "user" | "team";
  subjectId: string;
  /** commenter(W23): 보고 댓글만. 계층은 viewer < commenter < editor < admin(org-service). */
  role: "viewer" | "commenter" | "editor" | "admin";
}
