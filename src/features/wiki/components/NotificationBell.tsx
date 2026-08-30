import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@chanho/react";
import { AtSign, Bell, FileText, MessageSquare, Share2 } from "lucide-react";
import type { NotificationList, NotificationType, User } from "../store/types";
import { listNotifications, listUsers, markNotificationsRead } from "../store/wikiStore";
import { relativeTime } from "../lib/relativeTime";
import { useDismissablePopover } from "../lib/useDismissablePopover";

/** 타입별 아이콘·문구 — 사용자 스펙: 멘션됨 / 관심 페이지 업데이트 / 댓글. */
const TYPE_META: Record<NotificationType, { icon: typeof Bell; text: (actor: string) => string }> = {
  mentioned: { icon: AtSign, text: (actor) => `${actor}님이 나를 멘션했습니다` },
  page_updated: { icon: FileText, text: (actor) => `${actor}님이 페이지를 업데이트했습니다` },
  comment: { icon: MessageSquare, text: (actor) => `${actor}님이 댓글을 남겼습니다` },
  shared: { icon: Share2, text: (actor) => `${actor}님이 이 문서를 공유했습니다` },
};

/**
 * TopBar 알림 벨 — 미읽음 배지 + 클릭 시 알림함 팝오버.
 * 목록은 마운트 시 1회 + 열 때마다 다시 불러온다(폴링 없음 — 실시간 푸시는 후속 결정).
 * 항목 클릭 = 해당 알림 읽음 + 페이지로 이동. 행위자 이름은 org 디렉터리(listUsers)로
 * 해석하고 없으면 "사용자 #id" 폴백(작성자 표시와 같은 규칙).
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NotificationList | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const reload = useCallback(() => {
    void listNotifications().then(setList).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    reload();
    void listUsers().then(setUsers);
  }, [open, reload]);

  const close = useCallback(() => setOpen(false), []);
  useDismissablePopover({ containerRef, triggerRef, open, onClose: close });

  const actorName = (id: string) => users.find((u) => u.id === id)?.name ?? `사용자 #${id}`;
  const unread = list?.unreadCount ?? 0;

  const openItem = (id: string, spaceId: string, pageId: string) => {
    void markNotificationsRead([id]).then(reload);
    setOpen(false);
    if (spaceId) navigate(`/spaces/${spaceId}/pages/${pageId}`);
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <Button
        ref={triggerRef}
        size="small"
        variant="ghost"
        iconOnly
        aria-label={unread > 0 ? `알림 ${unread}개 안 읽음` : "알림"}
        title="알림"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={16} aria-hidden="true" />
        {unread > 0 ? (
          <span className="notification-badge" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div className="notification-popover" role="dialog" aria-label="알림함">
          <div className="notification-popover-head">
            <h3>알림</h3>
            {unread > 0 ? (
              <button
                type="button"
                className="notification-read-all"
                onClick={() => void markNotificationsRead().then(reload)}
              >
                모두 읽음
              </button>
            ) : null}
          </div>
          {!list || list.items.length === 0 ? (
            <p className="notification-empty">
              멘션되거나 내 페이지가 업데이트되면 여기에 모입니다
            </p>
          ) : (
            <ul className="notification-list">
              {list.items.map((n) => {
                const meta = TYPE_META[n.type];
                const Icon = meta.icon;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={n.read ? "notification-item" : "notification-item notification-item--unread"}
                      onClick={() => openItem(n.id, n.spaceId, n.pageId)}
                    >
                      <Icon size={16} aria-hidden="true" className="notification-item-icon" />
                      <span className="notification-item-body">
                        <span className="notification-item-title">{n.pageTitle || "삭제된 페이지"}</span>
                        <span className="notification-item-text">{meta.text(actorName(n.actorId))}</span>
                        {/* 공유 메모 — "왜 봐야 하는지"가 곧 이 알림의 내용이다 */}
                        {n.note ? <span className="notification-item-note">“{n.note}”</span> : null}
                      </span>
                      <span className="notification-item-time">{relativeTime(n.createdAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* 설정으로 가는 길은 알림함 안에 있어야 한다 — "이거 어떻게 끄지"가 생기는 자리가 여기다 */}
          <div className="notification-popover-foot">
            <Link to="/settings/notifications" onClick={() => setOpen(false)}>
              알림 설정
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
