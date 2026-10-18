// 목업 저장소(localStorage wiki.v1) 전체 모양 — 목업 전용.
import type { Comment } from "./comments";
import type { MigrationJobRecord } from "./migrations";
import type { Notification, NotificationPrefsPatch } from "./notifications";
import type { AuditEntry, OrgMockState, RestrictionPrincipal, Team, User } from "./org";
import type { Page, PageTemplate, PageVersion, TrashEntry } from "./pages";
import type { Space, SpaceGrant } from "./spaces";

/** localStorage `wiki.v1`에 저장되는 루트 구조 */
export interface WikiData {
  users: User[];
  spaces: Space[];
  pages: Page[];
  versions: PageVersion[];
  comments: Comment[];
  /** 알림 — 목업 전용 저장(백엔드 모드는 V11 notification 테이블). 없던 저장분 호환 optional. */
  notifications?: Notification[];
  /** 알림 설정(W23) — 목업 저장. 키 = userId. */
  notificationPrefs?: Record<string, NotificationPrefsPatch>;
  /** 스페이스 삭제 기록 — 목업 저장. 백엔드는 audit_log의 SPACE_DELETED 행(V30). */
  spaceAudit?: AuditEntry[];
  /** 페이지 제한(W18) — 목업 저장. 키 = pageId. 없던 저장분 호환 optional. */
  restrictions?: Record<string, { view: RestrictionPrincipal[]; edit: RestrictionPrincipal[] }>;
  /**
   * 휴지통(W21-1) — 목업 저장. 버려진 페이지를 살아 있는 배열에서 빼고 여기로 옮긴다.
   * 백엔드는 같은 행에 deleted_at을 찍지만(V13), 목업은 별도 배열이 조회 경로를 건드리지 않아
   * "버린 문서가 어딘가에서 되살아나는" 실수를 구조적으로 막는다.
   */
  trash?: TrashEntry[];
  /** 페이지 라벨(W21-2) — 키 = pageId. 없던 저장분 호환 optional. */
  labels?: Record<string, string[]>;
  /** 리액션(W23) — 키 = "PAGE:id" | "COMMENT:id", 값 = 사용자별 이모지 목록. */
  reactions?: Record<string, Record<string, string[]>>;
  /** 페이지 템플릿(W23) — 스페이스 스코프. */
  templates?: PageTemplate[];
  /** 팀(W23) — 시드 두 팀 외에 만든 것. 팀원은 팀 id → 사용자 id 목록. */
  teams?: Team[];
  teamMembers?: Record<string, string[]>;
  /** 페이지 구독(W21-4) — 키 = pageId, 값 = 구독자 id 목록. */
  watches?: Record<string, string[]>;
  /**
   * 스페이스 구독(W27-4) — 키 = spaceId, 값 = 구독자 id 목록. 백엔드 V32 space_watch에 해당.
   * 페이지 구독과 달리 자동 구독이 없다 — 스페이스에는 "관심의 사건"이 없다.
   */
  spaceWatches?: Record<string, string[]>;
  /** 스페이스 권한(W22) — 키 = spaceId. 백엔드 모드는 org-service가 원장이다. */
  grants?: Record<string, SpaceGrant[]>;
  /**
   * 마이그레이션 잡(M1) — 목업 저장. 백엔드는 migration_job/item/issue 테이블이다.
   * **원본 토큰은 여기에 들어가지 않는다** — 목업도 저장하지 않는 것이 계약이다(설계 §1.1 P8).
   */
  migrations?: MigrationJobRecord[];
  /** 조직 관리 화면(U4)의 목업 상태. 백엔드 모드는 org-service가 원장이다. */
  org?: OrgMockState;
}
