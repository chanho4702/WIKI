import { AtSign, Bell, FilePlus, FileText, MessageSquare, Share2 } from "lucide-react";
import type { NotificationType } from "../store/types";

/** 알림 종류별 아이콘·이름·문구 — 알림 벨과 전체 알림 화면(F-05)이 같은 것을 쓴다. */
export const NOTIFICATION_TYPE_META: Record<
  NotificationType,
  { icon: typeof Bell; label: string; text: (actor: string) => string }
> = {
  mentioned: { icon: AtSign, label: "멘션", text: (actor) => `${actor}님이 나를 멘션했습니다` },
  page_updated: { icon: FileText, label: "문서 수정", text: (actor) => `${actor}님이 페이지를 업데이트했습니다` },
  comment: { icon: MessageSquare, label: "댓글", text: (actor) => `${actor}님이 댓글을 남겼습니다` },
  shared: { icon: Share2, label: "공유", text: (actor) => `${actor}님이 이 문서를 공유했습니다` },
  // 스페이스 구독(W27-4) — "고쳤다"가 아니라 "새로 생겼다"를 구분해서 알린다
  page_published: { icon: FilePlus, label: "새 문서", text: (actor) => `${actor}님이 새 문서를 게시했습니다` },
};

export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_TYPE_META) as NotificationType[];
