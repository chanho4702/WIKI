import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapCollaborationDocument,
  getCurrentUser,
  requestCollaborationTicket,
} from "../../store/wikiStore";
import { CollaborationDraftResetError } from "../../store/types";
import type { WikiLinkTarget } from "../../lib/wikiLinks";
import type {
  CollaborationBinding,
  CollaborationConnectionStatus,
  CollaborationParticipant,
  CollaborationSession,
} from "./session";

export const COLLABORATION_ENABLED =
  import.meta.env.VITE_WIKI_COLLABORATION_ENABLED === "true";

/**
 * 리셋 직후 새 연결은 서버가 옛 문서를 언로드할 때까지(최대 5초) 기다렸다 붙이고, 넘기면 인증을 거부한다.
 * 그래서 restart 뒤 첫 인증 거부 한 번만 잠시 뒤 새 세션으로 다시 시도한다(무한 반복하지 않는다).
 */
export const RESTART_AUTH_RETRY_DELAY_MS = 1000;

interface UseCollaborationSessionOptions {
  enabled: boolean;
  pageId: string | null;
  basePageVersion: number | null;
  initialTitle: string | null;
  initialMarkdown: string | null;
  /**
   * `[[제목]]` 판별용 후보를 동기로 읽는 게터(2026-08-28).
   * 예전에는 스페이스의 전 페이지 배열을 받았다 — 공동 편집 세션 하나가 스페이스 전량을 붙들었다.
   */
  getLinkTargets: () => WikiLinkTarget[];
}

/** 편집기가 닫힌 뒤에도 사용자가 보고 복사할 수 있게 남기는 이 탭의 미게시 편집 사본. */
export interface CollaborationLocalCopy {
  title: string;
  markdown: string;
}

export interface CollaborationSessionState {
  status: CollaborationConnectionStatus;
  participants: CollaborationParticipant[];
  error: string | null;
  binding: CollaborationBinding | null;
  /**
   * 공동 초안이 지금 기준으로 삼는 페이지 버전. 다른 편집자의 정상 게시로 옵션의 basePageVersion보다
   * 앞설 수 있다(초안은 그대로 이어진다). 게시 요청의 기대 버전은 이 값을 쓴다.
   */
  basePageVersion: number | null;
  generation: number | null;
  /** 리셋으로 편집기를 잃었을 때 되살린 이 탭의 편집 사본. restart 전까지 유지한다. */
  localCopy: CollaborationLocalCopy | null;
  retry: () => void;
  /**
   * 공동 초안 리셋(status "stale") 뒤 새 세션을 시작한다. 이 탭의 옛 Y.Doc은 새 초안에 절대 합치지 않는다 —
   * 호출자는 최신 페이지(버전·제목·본문)로 기준을 바꾼 뒤 부른다.
   */
  restart: () => void;
}

/** 수동 재연결 때 이어 붙일 옛 탭의 Y.Doc. 같은 세션 기준 버전·같은 초안 리셋 세대에만 쓴다. */
interface RecoveryState {
  basePageVersion: number;
  draftEpoch: number | undefined;
  state: Uint8Array;
}

/** 지금 페이지 기준(옵션 basePageVersion)으로 마지막에 연 세션의 연속성 정보. */
interface SessionLineage {
  propBase: number;
  base: number;
  draftEpoch: number | undefined;
}

export function useCollaborationSession({
  enabled,
  pageId,
  basePageVersion,
  initialTitle,
  initialMarkdown,
  getLinkTargets,
}: UseCollaborationSessionOptions): CollaborationSessionState {
  const [retryKey, setRetryKey] = useState(0);
  const [status, setStatus] = useState<CollaborationConnectionStatus>(
    enabled && pageId && basePageVersion !== null && initialTitle !== null && initialMarkdown !== null
      ? "connecting"
      : "disabled",
  );
  const [participants, setParticipants] = useState<CollaborationParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<CollaborationBinding | null>(null);
  const [draftBase, setDraftBase] = useState<number | null>(null);
  const [generation, setGeneration] = useState<number | null>(null);
  const [localCopy, setLocalCopy] = useState<CollaborationLocalCopy | null>(null);
  const [ready, setReady] = useState(false);
  const sessionRef = useRef<CollaborationSession | null>(null);
  const bindingRef = useRef<CollaborationBinding | null>(null);
  const recoveryStateRef = useRef<RecoveryState | null>(null);
  const lineageRef = useRef<SessionLineage | null>(null);
  // 리셋된 세션은 브라우저 online 이벤트나 "다시 연결"로 되살리지 않는다 — restart()만 새로 시작한다.
  const staleRef = useRef(false);
  // restart()가 준 인증 재시도 기회. 쓰거나 동기화에 성공하면 0으로 돌아간다.
  const authRetryBudgetRef = useRef(0);
  const getLinkTargetsRef = useRef(getLinkTargets);
  getLinkTargetsRef.current = getLinkTargets;

  useEffect(() => {
    // 브라우저 이벤트는 힌트다. 웹소켓이 살아 있으면 provider가 새 상태 이벤트를 내지 않으므로
    // 상태를 강제로 덮지 않고 provider의 실제 상태를 다시 읽어 반영한다.
    const handleOnline = () => {
      if (!enabled || !pageId || staleRef.current) return;
      const session = sessionRef.current;
      if (session) {
        session.reconnect();
        setStatus(session.connectionStatus());
      } else {
        setRetryKey((key) => key + 1);
      }
    };
    const handleOffline = () => {
      if (!enabled || !pageId || staleRef.current) return;
      const session = sessionRef.current;
      setStatus(session ? session.connectionStatus() : "offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled, pageId]);

  useEffect(() => {
    staleRef.current = false;
    if (
      !enabled
      || !pageId
      || basePageVersion === null
      || initialTitle === null
      || initialMarkdown === null
    ) {
      setStatus("disabled");
      setParticipants([]);
      setError(null);
      setCandidate(null);
      setDraftBase(null);
      setGeneration(null);
      setLocalCopy(null);
      setReady(false);
      bindingRef.current = null;
      recoveryStateRef.current = null;
      lineageRef.current = null;
      return;
    }
    setError(null);
    setCandidate(null);
    setDraftBase(null);
    setGeneration(null);
    setReady(false);
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }

    let cancelled = false;
    let authRetryTimer: ReturnType<typeof setTimeout> | undefined;
    let destroy: (() => void) | undefined;
    let activeBinding: CollaborationBinding | null = null;
    let loadedModule: typeof import("./session") | null = null;
    // 이 세션의 편집기가 한 번이라도 노출됐는지(첫 synced). 노출 전이면 사용자는 편집기로 내용을 볼 수 없다.
    let exposed = false;
    let liveSession: CollaborationSession | null = null;
    setStatus("connecting");

    const enterReset = (message: string) => {
      staleRef.current = true;
      // 옛 기준의 Y.Doc 스냅샷은 새 초안에 합치면 내용이 중복된다 — 다시 쓰지 않는다. 다만 편집기로 볼 수 없는
      // 편집(옛 세션이 닫혔거나, 새 세션이 첫 synced 전)은 사용자가 옮길 수 있게 읽을 수 있는 사본으로 남긴다.
      // 활성 세션의 문서가 있으면 그것(스냅샷을 이어 받은 뒤의 최신)을, 없으면 유지한 스냅샷을 쓴다.
      const recovery = recoveryStateRef.current;
      recoveryStateRef.current = null;
      const unexposedState = !exposed && liveSession ? liveSession.snapshot() : recovery?.state;
      if (!exposed && unexposedState && loadedModule) {
        try {
          setLocalCopy(loadedModule.collaborationStateToMarkdown(unexposedState));
        } catch {
          // 되살리기 실패는 리셋 흐름을 막지 않는다 — 화면은 마지막으로 불러온 본문을 보여 준다.
        }
      }
      setStatus("stale");
      setError(message);
    };

    // Hocuspocus/Yjs는 편집 기능 플래그가 켜진 세션에서만 내려받는다. 일반 조회·편집의 초기
    // 번들에 공동 편집 transport를 싣지 않아 현재 사용자 UX를 희생하지 않는다.
    void Promise.all([
      import("./session"),
      getCurrentUser(),
      requestCollaborationTicket(pageId),
    ])
      .then(async ([sessionModule, user, bootstrapTicket]) => {
        loadedModule = sessionModule;
        if (cancelled) return;
        const recovery = recoveryStateRef.current;
        const lineage = lineageRef.current?.propBase === basePageVersion ? lineageRef.current : null;
        const draftEpoch = bootstrapTicket.draftEpoch;
        // 이어 붙일 스냅샷이 지금 초안과 호환되지 않으면 조용히 새로 시작하지 않는다(편집 유실 방지).
        if (recovery) {
          if (recovery.basePageVersion !== basePageVersion) throw new CollaborationDraftResetError();
          sessionModule.assertTicketDraftEpoch(bootstrapTicket, recovery.draftEpoch);
        } else if (lineage) {
          sessionModule.assertTicketDraftEpoch(bootstrapTicket, lineage.draftEpoch);
        }
        // 페이지 버전 대조는 세션 시작(bootstrap 직전)에만 한다. 같은 공동 초안(리셋 세대 동일)이 다른
        // 편집자의 정상 게시로 앞서 나간 경우는 리셋이 아니다 — 초안의 새 기준 버전으로 이어 간다.
        let expectedBase = lineage?.base ?? basePageVersion;
        const continuing = lineage !== null
          && typeof draftEpoch === "number"
          && draftEpoch === lineage.draftEpoch
          && typeof bootstrapTicket.pageVersion === "number"
          && bootstrapTicket.pageVersion > expectedBase;
        if (continuing) expectedBase = bootstrapTicket.pageVersion!;
        else sessionModule.assertTicketPageVersion(bootstrapTicket, expectedBase);

        const state = sessionModule.createCollaborationBootstrapState(initialTitle, initialMarkdown);
        const bootstrap = await bootstrapCollaborationDocument(
          pageId,
          expectedBase,
          bootstrapTicket.ticket,
          state,
        );
        if (cancelled) return;
        if (bootstrap.basePageVersion !== expectedBase) {
          throw new CollaborationDraftResetError(
            `공동 초안은 페이지 v${bootstrap.basePageVersion}을 기준으로 합니다. 최신 문서와 병합이 필요합니다.`,
          );
        }
        setDraftBase(expectedBase);
        setGeneration(bootstrap.generation);
        const socketTicket = await requestCollaborationTicket(pageId);
        if (cancelled) return;
        const sessionEpoch = draftEpoch ?? socketTicket.draftEpoch;
        let liveBinding: CollaborationSession | null = null;
        const session = sessionModule.createCollaborationSession({
          pageId,
          user,
          initialTicket: socketTicket,
          draftEpoch: sessionEpoch,
          initialState: recovery?.state,
          issueTicket: requestCollaborationTicket,
          getPages: () => getLinkTargetsRef.current(),
          onStatus: (nextStatus) => {
            if (staleRef.current && nextStatus !== "stale") return;
            if (nextStatus === "synced" && liveBinding && !liveBinding.title.toString().trim()) {
              setStatus("error");
              setError("공동 초안의 제목 형식이 오래되었습니다. 초안을 재설정한 뒤 다시 연결해 주세요.");
              return;
            }
            setStatus(nextStatus);
            if (nextStatus === "synced") {
              // 스냅샷은 편집기가 노출될 때까지 유지한다 — 그 전에 리셋이 오면 사본의 원천이다.
              exposed = true;
              recoveryStateRef.current = null;
              authRetryBudgetRef.current = 0;
              setReady(true);
              setError(null);
            }
          },
          onParticipants: setParticipants,
          onError: setError,
          onReset: enterReset,
          onAuthenticationFailed: () => {
            if (cancelled || authRetryBudgetRef.current <= 0) return false;
            authRetryBudgetRef.current -= 1;
            setStatus("connecting");
            authRetryTimer = setTimeout(
              () => setRetryKey((key) => key + 1),
              RESTART_AUTH_RETRY_DELAY_MS,
            );
            return true;
          },
        });
        lineageRef.current = { propBase: basePageVersion, base: expectedBase, draftEpoch: sessionEpoch };
        liveSession = session;
        liveBinding = session;
        activeBinding = session;
        bindingRef.current = session;
        sessionRef.current = session;
        setCandidate(session);
        destroy = session.destroy;
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof CollaborationDraftResetError) {
          enterReset(caught.message);
          return;
        }
        setStatus("error");
        setError(caught instanceof Error
          ? caught.message
          : "공동 편집 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      });

    return () => {
      cancelled = true;
      if (authRetryTimer !== undefined) clearTimeout(authRetryTimer);
      if (sessionRef.current === activeBinding) sessionRef.current = null;
      if (bindingRef.current === activeBinding) bindingRef.current = null;
      destroy?.();
    };
  }, [basePageVersion, enabled, initialMarkdown, initialTitle, pageId, retryKey]);

  const retry = useCallback(() => {
    if (!navigator.onLine || staleRef.current) return;
    const snapshot = bindingRef.current?.snapshot();
    const lineage = lineageRef.current;
    if (snapshot && basePageVersion !== null) {
      recoveryStateRef.current = {
        basePageVersion,
        draftEpoch: lineage?.propBase === basePageVersion ? lineage.draftEpoch : undefined,
        state: snapshot,
      };
    }
    setRetryKey((key) => key + 1);
  }, [basePageVersion]);

  const restart = useCallback(() => {
    recoveryStateRef.current = null;
    lineageRef.current = null;
    staleRef.current = false;
    authRetryBudgetRef.current = 1;
    setLocalCopy(null);
    setRetryKey((key) => key + 1);
  }, []);

  return {
    status,
    participants,
    error,
    binding: ready ? candidate : null,
    basePageVersion: draftBase,
    generation,
    localCopy,
    retry,
    restart,
  };
}
