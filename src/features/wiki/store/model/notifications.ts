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
}

export type NotificationPrefsPatch = Pick<
  NotificationPrefs,
  "emailEnabled" | "emailMode" | "mentioned" | "pageUpdated" | "comment" | "shared"
>;

export interface NotificationList {
  unreadCount: number;
  items: Notification[];
}
