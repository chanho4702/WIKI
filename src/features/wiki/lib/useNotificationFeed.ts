import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationList } from "../store/types";
import { listNotifications } from "../store/wikiStore";

/** 보이는 탭의 기본 갱신 간격 — 배지는 "곧" 맞으면 되고 실시간 푸시는 별도 결정이다. */
export const NOTIFICATION_POLL_MS = 60_000;
/** 연속 실패 시 간격 상한 — 서버가 내려가 있을 때 탭 수만큼 매분 두드리지 않게. */
export const NOTIFICATION_POLL_MAX_MS = 5 * 60_000;
/** 포커스·탭 복귀 갱신의 최소 간격 — 창을 오가며 클릭할 때마다 요청이 나가지 않게. */
export const NOTIFICATION_REFOCUS_MIN_MS = 10_000;
/** 이보다 오래 끝나지 않는 요청은 걸린 것으로 보고 **끊은 뒤** 새로 보낸다(갱신이 영영 멈추지 않게). */
export const NOTIFICATION_REQUEST_STALE_MS = 30_000;

function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * 알림 목록(배지) 갱신 — 마운트·주기·탭 복귀·창 포커스·사용자 동작.
 *
 * 예전에는 마운트 1회와 팝오버를 열 때만 읽어, 페이지를 오래 열어 두면 새 알림 배지가 영영 안 떴다.
 * 규칙:
 * - **요청은 한 번에 하나다.** 나가 있는 동안의 주기·포커스 갱신은 건너뛴다. 너무 오래 걸린 요청은
 *   끊고(abort) 새로 보낸다 — 둘이 동시에 나가 있는 순간이 없다.
 * - 사용자 동작(열기·읽음 처리) 뒤의 갱신은 나가 있던 요청의 응답을 **버리고**, 그 요청이 끝나면 곧바로
 *   새로 읽는다 — 읽음 처리 전에 나간 응답이 "안 읽음"을 되살리지 않으면서도 요청이 겹치지 않는다.
 * - 주기 타이머는 언제나 하나가 걸려 있다 — 요청이 걸려 끝나지 않아도 다음 주기는 온다. 요청이 끝나면
 *   그 시점부터 다시 건다(실패 백오프를 바로 반영).
 * - 숨은 탭에서는 주기 요청을 보내지 않는다. 돌아오면 바로 한 번 읽는다.
 * - 실패하면 마지막 목록을 그대로 두고(배지를 0으로 지우지 않는다) 간격을 두 배씩 늘린다.
 * - 언마운트 뒤에 도착한 응답은 버린다.
 */
export function useNotificationFeed(): { list: NotificationList | null; reload: () => void } {
  const [list, setList] = useState<NotificationList | null>(null);
  /** 나가 있는 요청의 표지 — 시작 시각으로 걸린 요청을 가려낸다 */
  const inFlight = useRef<{ startedAt: number; controller: AbortController } | null>(null);
  /** 나가 있는 요청이 끝나면 새로 읽어야 하는가(그 응답은 이미 버리기로 했다) */
  const refetch = useRef(false);
  const generation = useRef(0);
  const lastFetchAt = useRef(0);
  const failures = useRef(0);
  const mounted = useRef(true);
  /** 지금 마운트된 effect의 "다음 주기 걸기" — 요청이 끝날 때 부른다 */
  const scheduleNext = useRef<() => void>(() => {});

  const start = useCallback(function startRequest() {
    const mine = ++generation.current;
    const token = { startedAt: Date.now(), controller: new AbortController() };
    inFlight.current = token;
    lastFetchAt.current = token.startedAt;
    void listNotifications({ signal: token.controller.signal })
      .then((next) => {
        if (!mounted.current || mine !== generation.current) return;
        failures.current = 0;
        setList(next);
      })
      .catch(() => {
        if (mounted.current && mine === generation.current) failures.current += 1;
      })
      .finally(() => {
        if (inFlight.current !== token) return; // 끊긴 요청 — 이미 새 요청이 나갔거나 언마운트됐다
        inFlight.current = null;
        if (!mounted.current) return;
        if (refetch.current) {
          refetch.current = false;
          startRequest();
          return;
        }
        scheduleNext.current();
      });
  }, []);

  /**
   * @param fresh true면 나가 있는 요청의 응답을 버리고 끝나는 대로 새로 읽는다(사용자 동작·마운트).
   * @returns 지금 새 요청을 보냈는가
   */
  const request = useCallback(
    (fresh: boolean): boolean => {
      const pending = inFlight.current;
      if (pending && Date.now() - pending.startedAt < NOTIFICATION_REQUEST_STALE_MS) {
        if (fresh) {
          generation.current += 1;
          refetch.current = true;
        }
        return false;
      }
      // 걸린 요청은 끊는다 — 응답을 버리기만 하면 요청이 겹친다.
      pending?.controller.abort();
      refetch.current = false;
      start();
      return true;
    },
    [start],
  );

  useEffect(() => {
    mounted.current = true;
    // 이 effect 실행에 묶인 플래그 — StrictMode 재마운트에서 옛 타이머가 살아남지 않게.
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (!active) return;
      if (timer) clearTimeout(timer);
      // 간격은 직전 요청이 끝난 뒤에 정한다 — 실패가 기록되기 전에 정하면 백오프가 늘지 않는다.
      const delay = Math.min(NOTIFICATION_POLL_MS * 2 ** failures.current, NOTIFICATION_POLL_MAX_MS);
      timer = setTimeout(() => {
        timer = undefined;
        if (!isHidden()) request(false);
        // 요청을 보냈든 건너뛰었든 다음 주기를 건다 — 그 요청이 걸려도 폴링(과 걸린 요청 끊기)이 이어진다.
        schedule();
      }, delay);
    };
    scheduleNext.current = schedule;
    // 재마운트(StrictMode)에서 이전 마운트의 요청이 아직 나가 있으면 겹쳐 보내지 않고 끝난 뒤 새로 읽는다.
    request(true);
    // 타이머는 언제나 건다 — 첫 요청이 걸려 끝나지 않아도 다음 주기가 살아 있어야 한다(끝나면 다시 걸린다).
    schedule();

    const refresh = () => {
      if (isHidden()) return;
      if (Date.now() - lastFetchAt.current < NOTIFICATION_REFOCUS_MIN_MS) return;
      request(false);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      mounted.current = false;
      generation.current += 1; // 진행 중이던 응답을 버린다
      refetch.current = false;
      // 진짜 언마운트면 나가 있는 요청을 끊는다. StrictMode 재마운트는 곧바로 request(true)가 이어
      // 새로 읽으므로 끊어도 잃는 것이 없다.
      inFlight.current?.controller.abort();
      inFlight.current = null;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [request]);

  /** 사용자 동작(팝오버 열기·읽음 처리) 뒤의 갱신. */
  const reload = useCallback(() => {
    request(true);
  }, [request]);

  return { list, reload };
}
