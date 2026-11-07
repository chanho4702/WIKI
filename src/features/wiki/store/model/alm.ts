// ALM 이슈 카드(위키↔ALM 스마트 링크, W3) — alm-backend `GET /api/alm/issues/cards` 응답의 도메인 모양.
// 위키는 ALM을 소유하지 않는다: 이 타입은 보기 렌더가 필요한 최소 요약뿐이다.

/** 레지스트리(타입·상태·우선순위) 값의 표시 요약. 레지스트리에 없는 ID면 name=id, icon·color=null. */
export interface AlmRegistryValue {
  id: string;
  name: string;
  /** alm-front 아이콘 키(lucide 이름 체계, 예 `check-square`). 모르는 키는 화면이 아이콘을 생략한다. */
  icon: string | null;
  /** DS Lozenge appearance 이름(neutral/info/success/warning/danger). */
  color: string | null;
}

export type AlmStatusKind = "new" | "active" | "complete";

export interface AlmIssueCard {
  key: string;
  /** 프론트 id 규칙대로 string(백엔드 Long). */
  projectId: string;
  projectKey: string;
  title: string;
  type: AlmRegistryValue;
  status: AlmRegistryValue & { kind: AlmStatusKind | null };
  priority: AlmRegistryValue | null;
  assignee: { id: string; displayName: string | null } | null;
  /** `YYYY-MM-DD` 또는 null. */
  dueDate: string | null;
  /** 완료(상태 kind complete 또는 resolution 있음) — 키에 취소선. */
  resolved: boolean;
  /** 정규 주소(`/alm/browse/KEY`). */
  url: string;
}
