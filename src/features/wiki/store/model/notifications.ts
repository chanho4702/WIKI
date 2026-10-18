// 알림·알림 설정 도메인 타입.

/** "page_published"(W27-4)는 새 문서 게시 — 스페이스 구독이 생기며 의미가 붙은 사건이다. */
export type NotificationType =
  | "mentioned"
  | "page_updated"
  | "comment"
  | "shared"
  | "page_published";

export interface Notification {
  id: string;
  /** 수신자 — 목업은 항상 현재 사용자 행만 보여준다. */
  userId: string;
  type: NotificationType;
  pageId: string;
  /** 라우팅용(/spaces/{s}/pages/{p}) — 페이지 삭제 시 알림도 함께 사라져 대부분 존재. */
  spaceId: string;
  pageTitle: string;
  actorId: string;
  createdAt: string;
  read: boolean;
  /** 공유 메모(shared). 다른 타입은 없다. */
  note?: string | null;
}

/**
 * 알림 설정(W23) — 이메일 채널. 알림함은 항상 켜져 있고, 여기서는 "어떤 알림을 메일로도 받을지"만
 * 정한다. emailConfigured가 false면(서버에 발송 구성이 없음) 스위치는 저장되지만 아무것도 가지
 * 않는다 — 화면이 그 사실을 먼저 말해야 한다.
 */
export interface NotificationPrefs {
  emailConfigured: boolean;
  /** 서버가 토큰에서 스냅샷한 수신 주소. 아직 모르면 null. */
  email: string | null;
  emailEnabled: boolean;
  /** 바로 보낼지(IMMEDIATE), 하루 한 번 모아 보낼지(DAILY). */
  emailMode: "IMMEDIATE" | "DAILY";
  mentioned: boolean;
  pageUpdated: boolean;
  comment: boolean;
  shared: boolean;
  /**
   * 새 문서 게시(F-05) — 예전에는 pageUpdated에 묶여 있었다. 이 필드를 모르는 구버전 서버 응답에서는
   * 어댑터가 pageUpdated 값으로 채운다(서버도 저장값이 없으면 pageUpdated를 따른다).
   */
  pagePublished: boolean;
}

export type NotificationPrefsPatch = Pick<
  NotificationPrefs,
  "emailEnabled" | "emailMode" | "mentioned" | "pageUpdated" | "comment" | "shared"
> & {
  /** 생략하면 서버가 pageUpdated를 따른다(구버전 화면 호환). */
  pagePublished?: boolean;
};

export interface NotificationList {
  /** 안 읽은 알림 수 — 종류 필터와 무관하게 전체 기준이다(배지). */
  unreadCount: number;
  items: Notification[];
  /** 다음 쪽 커서(F-05). null이면 마지막 쪽. 화면에는 불투명한 문자열이다. 구버전 서버는 주지 않는다. */
  nextBefore?: string | null;
}

/**
 * 구독 목록(F-06, `GET /api/wiki/watches`). 권한을 잃은 항목은 `hidden`이고 제목·이름이 null이다 —
 * 이름은 가리되 해제는 할 수 있어야 한다(알림을 끌 길이 없으면 안 된다).
 */
export interface WatchedPage {
  pageId: string;
  spaceId: string;
  title: string | null;
  spaceName: string | null;
  hidden: boolean;
}

export interface WatchedSpace {
  spaceId: string;
  name: string | null;
  hidden: boolean;
}

export interface WatchList {
  pages: WatchedPage[];
  spaces: WatchedSpace[];
}

/** 알림 목록 조회 옵션(F-05) — 모두 생략하면 예전처럼 최근 한 쪽(서버 기본 크기). */
export interface NotificationQuery {
  signal?: AbortSignal;
  /** 이전 쪽의 nextBefore */
  before?: string;
  /** 1~100 */
  limit?: number;
  /** 이 종류만. 비우면 전부. */
  types?: NotificationType[];
}
