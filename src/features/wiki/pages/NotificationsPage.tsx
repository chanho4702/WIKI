import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Banner, Button, EmptyState, PageHeader, Select, Skeleton } from "@chanho/react";
import { SkeletonLine, SkeletonRegion } from "../components/WikiSkeleton";
import { Bell, Layers } from "lucide-react";
import type { Notification, NotificationType, User } from "../store/types";
import { listNotifications, listUsers, markNotificationsRead } from "../store/wikiStore";
import { NOTIFICATION_TYPE_META, NOTIFICATION_TYPES } from "../components/notificationMeta";
import { relativeTime } from "../lib/relativeTime";

/** 한 쪽 크기 — 벨(서버 기본 30)보다 넉넉히. 서버 상한은 100. */
const PAGE_SIZE = 50;
const ALL = "ALL";
/** 빈 쪽(권한 필터로 통째로 걸러진 쪽)을 만나면 이만큼까지 이어 읽는다 — nextBefore가 있는 한 끝이 아니다 */
const EMPTY_PAGE_FOLLOW = 5;

function typeFromParam(value: string | null): NotificationType | null {
  return value !== null && (NOTIFICATION_TYPES as string[]).includes(value) ? (value as NotificationType) : null;
}

/**
 * 전체 알림(`/notifications`, F-05) — 벨은 최근 한 쪽만 보여 준다. 여기서는 이전 알림을 계속 읽고(커서 쪽 넘김),
 * 종류로 거른다(URL `type`에 남아 공유·뒤로 가기에 유지). 안 읽은 수는 필터와 무관한 전체 기준이다.
 */
/** 한 쪽을 읽되 빈 쪽이면 다음 커서로 몇 번 더 이어 읽는다(서버 계약: nextBefore가 null일 때만 끝). */
async function readPage(before: string | undefined, type: NotificationType | null) {
  const query = (cursor: string | undefined) =>
    listNotifications({ limit: PAGE_SIZE, ...(cursor ? { before: cursor } : {}), ...(type ? { types: [type] } : {}) });
  let page = await query(before);
  for (let i = 0; i < EMPTY_PAGE_FOLLOW && page.items.length === 0 && page.nextBefore; i++) {
    page = await query(page.nextBefore);
  }
  return page;
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const type = typeFromParam(params.get("type"));
  const [items, setItems] = useState<Notification[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  /** 필터를 바꾸면 앞 필터의 늦은 응답(첫 쪽·더 보기)을 버린다 */
  const generation = useRef(0);

  useEffect(() => {
    void listUsers().then(setUsers).catch(() => {}); // 이름은 부가 정보 — 실패하면 `사용자 #id`
  }, []);

  const loadFirst = useCallback(async () => {
    const mine = ++generation.current;
    setItems(null);
    setError(null);
    setNextBefore(null);
    try {
      const page = await readPage(undefined, type);
      if (mine !== generation.current) return;
      setItems(page.items);
      setNextBefore(page.nextBefore ?? null);
      setUnread(page.unreadCount);
    } catch (e) {
      if (mine === generation.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [type]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  const loadMore = async () => {
    if (!nextBefore) return;
    const mine = generation.current;
    setLoadingMore(true);
    try {
      const page = await readPage(nextBefore, type);
      if (mine !== generation.current) return;
      // 그사이 새 알림이 와도 커서 기준이라 겹치지 않는다 — 혹시 겹치면 id로 한 번 더 거른다
      setItems((current) => {
        const seen = new Set((current ?? []).map((n) => n.id));
        return [...(current ?? []), ...page.items.filter((n) => !seen.has(n.id))];
      });
      setNextBefore(page.nextBefore ?? null);
      setUnread(page.unreadCount);
    } catch (e) {
      if (mine === generation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const actorName = (id: string) => users.find((u) => u.id === id)?.name ?? `사용자 #${id}`;

  const openItem = (n: Notification) => {
    if (!n.read) {
      setItems((current) => current?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
      setUnread((count) => Math.max(0, count - 1));
      void markNotificationsRead([n.id]).catch(() => {});
    }
    if (n.spaceId) navigate(`/spaces/${n.spaceId}/pages/${n.pageId}`);
  };

  const readAll = async () => {
    try {
      await markNotificationsRead();
      setItems((current) => current?.map((x) => ({ ...x, read: true })) ?? null);
      setUnread(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="notifications-page">
      <PageHeader
        title="알림"
        actions={
          <>
            {unread > 0 ? (
              <Button size="small" variant="subtle" onClick={() => void readAll()}>
                모두 읽음 ({unread})
              </Button>
            ) : null}
            <Link to="/settings/notifications">알림 설정</Link>
          </>
        }
      />
      <div className="notifications-filters">
        <Select
          label="종류"
          value={type ?? ALL}
          options={[
            { value: ALL, label: "전체", icon: <Layers size={14} aria-hidden="true" /> },
            ...NOTIFICATION_TYPES.map((t) => {
              const Icon = NOTIFICATION_TYPE_META[t].icon;
              return { value: t, label: NOTIFICATION_TYPE_META[t].label, icon: <Icon size={14} aria-hidden="true" /> };
            }),
          ]}
          onValueChange={(next: string) => {
            const nextParams = new URLSearchParams(params);
            if (next === ALL) nextParams.delete("type");
            else nextParams.set("type", next);
            setParams(nextParams);
          }}
        />
      </div>
      {error !== null ? (
        <Banner variant="danger" action={{ label: "다시 시도", onClick: () => void loadFirst() }}>
          알림을 불러오지 못했습니다: {error}
        </Banner>
      ) : null}
      {items === null ? (
        error === null ? (
          <SkeletonRegion label="알림 불러오는 중" as="ul" className="notification-list notifications-page-list">
            {["58%", "44%", "66%", "50%", "38%"].map((width, i) => (
              <li key={i} className="notification-item">
                <Skeleton width={16} height={16} className="notification-item-icon" />
                <span className="notification-item-body">
                  <SkeletonLine className="notification-item-title" width={width} />
                  <SkeletonLine className="notification-item-text" width="36%" />
                </span>
                <SkeletonLine className="notification-item-time" width={40} />
              </li>
            ))}
          </SkeletonRegion>
        ) : null
      ) : items.length === 0 && !nextBefore ? (
        <EmptyState
          media={<Bell size={32} aria-hidden="true" />}
          title={type ? "이 종류의 알림이 없습니다" : "알림이 없습니다"}
          description="멘션되거나 구독한 문서에 변화가 있으면 여기에 모입니다."
        />
      ) : (
        <>
          <ul className="notification-list notifications-page-list" aria-label="알림 목록">
            {items.map((n) => {
              const meta = NOTIFICATION_TYPE_META[n.type];
              const Icon = meta.icon;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={n.read ? "notification-item" : "notification-item notification-item--unread"}
                    onClick={() => openItem(n)}
                  >
                    <Icon size={16} aria-hidden="true" className="notification-item-icon" />
                    <span className="notification-item-body">
                      <span className="notification-item-title">{n.pageTitle || "삭제된 페이지"}</span>
                      <span className="notification-item-text">{meta.text(actorName(n.actorId))}</span>
                      {n.note ? <span className="notification-item-note">“{n.note}”</span> : null}
                    </span>
                    <span className="notification-item-time">{relativeTime(n.createdAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {nextBefore ? (
            <Button variant="subtle" loading={loadingMore} onClick={() => void loadMore()}>
              이전 알림 더 보기
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
