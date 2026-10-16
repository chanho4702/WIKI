import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { NotificationList } from "../store/types";
import {
  NOTIFICATION_POLL_MAX_MS,
  NOTIFICATION_POLL_MS,
  NOTIFICATION_REFOCUS_MIN_MS,
  useNotificationFeed,
} from "./useNotificationFeed";

const store = vi.hoisted(() => ({ listNotifications: vi.fn() }));
vi.mock("../store/wikiStore", () => ({ listNotifications: store.listNotifications }));

const listOf = (unreadCount: number): NotificationList => ({ items: [], unreadCount });

let visibility: DocumentVisibilityState = "visible";

/** 마이크로태스크(프라미스 해소)까지 흘려보낸다 — 가짜 타이머는 then 체인을 돌리지 않는다. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  store.listNotifications.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useNotificationFeed", () => {
  it("보이는 탭에서는 주기적으로 다시 읽어 새 알림 배지를 반영한다", async () => {
    store.listNotifications.mockResolvedValueOnce(listOf(0)).mockResolvedValueOnce(listOf(2));
    const { result } = renderHook(() => useNotificationFeed());
    await flush();
    expect(result.current.list?.unreadCount).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(NOTIFICATION_POLL_MS);
    });
    await flush();
    expect(store.listNotifications).toHaveBeenCalledTimes(2);
    expect(result.current.list?.unreadCount).toBe(2);
  });

  it("숨은 탭에서는 주기 요청을 건너뛰고, 돌아오면 바로 한 번 읽는다", async () => {
    store.listNotifications.mockResolvedValue(listOf(1));
    renderHook(() => useNotificationFeed());
    await flush();
    expect(store.listNotifications).toHaveBeenCalledTimes(1);

    visibility = "hidden";
    await act(async () => {
      vi.advanceTimersByTime(NOTIFICATION_POLL_MS * 3);
    });
    await flush();
    expect(store.listNotifications).toHaveBeenCalledTimes(1);

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(store.listNotifications).toHaveBeenCalledTimes(2);
  });

  it("포커스 갱신은 최소 간격 안이면 다시 묻지 않는다", async () => {
    store.listNotifications.mockResolvedValue(listOf(0));
    renderHook(() => useNotificationFeed());
    await flush();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(store.listNotifications).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(NOTIFICATION_REFOCUS_MIN_MS);
      window.dispatchEvent(new Event("focus"));
    });
    await flush();
    expect(store.listNotifications).toHaveBeenCalledTimes(2);
  });

  it("요청이 나가 있는 동안에는 겹쳐 보내지 않는다", async () => {
    let release: (value: NotificationList) => void = () => {};
    store.listNotifications.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    store.listNotifications.mockResolvedValue(listOf(5));
    const { result } = renderHook(() => useNotificationFeed());

    await act(async () => {
      // 첫 요청이 아직 안 끝났다(걸린 요청 기준 시간 전) — 포커스 갱신은 겹쳐 보내지 않는다
      vi.advanceTimersByTime(NOTIFICATION_REFOCUS_MIN_MS);
      window.dispatchEvent(new Event("focus"));
    });
    expect(store.listNotifications).toHaveBeenCalledTimes(1);

    release(listOf(3));
    await flush();
    expect(result.current.list?.unreadCount).toBe(3);
  });

  it("나가 있는 요청 중 reload는 겹쳐 보내지 않고, 옛 응답을 버린 뒤 새로 읽는다", async () => {
    let releaseStale: (value: NotificationList) => void = () => {};
    store.listNotifications
      .mockReturnValueOnce(new Promise((resolve) => (releaseStale = resolve)))
      .mockResolvedValueOnce(listOf(0))
      .mockResolvedValue(listOf(6));
    const { result } = renderHook(() => useNotificationFeed());

    await act(async () => {
      result.current.reload(); // 읽음 처리 직후의 갱신
    });
    expect(store.listNotifications).toHaveBeenCalledTimes(1); // 겹치지 않는다

    releaseStale(listOf(4)); // 읽음 처리 전에 나간 요청의 늦은 응답
    await flush();
    expect(result.current.list?.unreadCount).toBe(0); // 버려졌고, 끝나자마자 새로 읽었다
    expect(store.listNotifications).toHaveBeenCalledTimes(2);

    // 사용자 동작 뒤에도 주기 갱신은 이어진다
    await act(async () => {
      vi.advanceTimersByTime(NOTIFICATION_POLL_MS);
    });
    await flush();
    expect(store.listNotifications).toHaveBeenCalledTimes(3);
    expect(result.current.list?.unreadCount).toBe(6);
  });

  it("걸린 요청이 있어도 일정 시간이 지나면 새 요청으로 갱신이 이어진다", async () => {
    store.listNotifications
      .mockReturnValueOnce(new Promise(() => {})) // 영영 끝나지 않는다
      .mockResolvedValue(listOf(2));
    const { result } = renderHook(() => useNotificationFeed());
    await act(async () => {
      vi.advanceTimersByTime(NOTIFICATION_POLL_MS); // 30초 넘게 걸린 요청 → 주기에 새로 보낸다
    });
    await flush();
    expect(store.listNotifications).toHaveBeenCalledTimes(2);
    expect(result.current.list?.unreadCount).toBe(2);
  });

  it("StrictMode 재마운트는 첫 요청을 끊고 하나만 살려 둔다", async () => {
    store.listNotifications
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue(listOf(1));
    const { result } = renderHook(() => useNotificationFeed(), { reactStrictMode: true });
    await flush();
    expect(store.listNotifications).toHaveBeenCalledTimes(2);
    const firstSignal = store.listNotifications.mock.calls[0][0]?.signal as AbortSignal;
    expect(firstSignal.aborted).toBe(true); // 동시에 둘이 나가 있지 않다
    expect(result.current.list?.unreadCount).toBe(1);
  });

  it("두 번째 주기 요청이 걸려도 폴링이 이어지고, 걸린 요청은 끊고 새로 읽는다", async () => {
    store.listNotifications
      .mockResolvedValueOnce(listOf(1))
      .mockReturnValueOnce(new Promise(() => {})) // 두 번째 요청이 영영 끝나지 않는다
      .mockResolvedValue(listOf(3));
    const { result } = renderHook(() => useNotificationFeed());
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(NOTIFICATION_POLL_MS); // 두 번째 요청 — 걸림
    });
    expect(store.listNotifications).toHaveBeenCalledTimes(2);
    await act(async () => {
      vi.advanceTimersByTime(NOTIFICATION_POLL_MS); // 다음 주기가 여전히 온다
    });
    await flush();
    expect(store.listNotifications).toHaveBeenCalledTimes(3);
    expect((store.listNotifications.mock.calls[1][0]?.signal as AbortSignal).aborted).toBe(true);
    expect(result.current.list?.unreadCount).toBe(3);
  });

  it("실패하면 마지막 목록을 지우지 않고 간격을 늘린다", async () => {
    store.listNotifications
      .mockResolvedValueOnce(listOf(1))
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValue(listOf(7));
    const { result } = renderHook(() => useNotificationFeed());
    await flush();

    await act(async () => {
      vi.advanceTimersByTime(NOTIFICATION_POLL_MS);
    });
    await flush();
    expect(store.listNotifications).toHaveBeenCalledTimes(2);
    expect(result.current.list?.unreadCount).toBe(1); // 실패로 배지를 0으로 만들지 않는다

    // 한 번 실패했으니 다음 간격은 두 배 — 기본 간격만 지나서는 다시 묻지 않는다
    await act(async () => {
      vi.advanceTimersByTime(NOTIFICATION_POLL_MS);
    });
    expect(store.listNotifications).toHaveBeenCalledTimes(2);
    await act(async () => {
      vi.advanceTimersByTime(Math.min(NOTIFICATION_POLL_MS * 2, NOTIFICATION_POLL_MAX_MS));
    });
    await flush();
    expect(store.listNotifications).toHaveBeenCalledTimes(3);
    expect(result.current.list?.unreadCount).toBe(7);
  });

  it("언마운트하면 타이머·리스너를 걷고 늦은 응답을 반영하지 않는다", async () => {
    let release: (value: NotificationList) => void = () => {};
    store.listNotifications.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const { result, unmount } = renderHook(() => useNotificationFeed());
    unmount();
    release(listOf(9));
    await flush();
    expect(result.current.list).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(NOTIFICATION_POLL_MAX_MS * 2);
      window.dispatchEvent(new Event("focus"));
    });
    expect(store.listNotifications).toHaveBeenCalledTimes(1);
  });
});
