import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapCollaborationDocument,
  getCurrentUser,
  requestCollaborationTicket,
} from "../../store/wikiStore";
import type { Page } from "../../store/types";
import type {
  CollaborationBinding,
  CollaborationConnectionStatus,
  CollaborationParticipant,
} from "./session";

export const COLLABORATION_ENABLED =
  import.meta.env.VITE_WIKI_COLLABORATION_ENABLED === "true";

interface UseCollaborationSessionOptions {
  enabled: boolean;
  pageId: string | null;
  basePageVersion: number | null;
  initialTitle: string | null;
  initialMarkdown: string | null;
  pages: Page[];
}

export interface CollaborationSessionState {
  status: CollaborationConnectionStatus;
  participants: CollaborationParticipant[];
  error: string | null;
  binding: CollaborationBinding | null;
  generation: number | null;
  retry: () => void;
}

export function useCollaborationSession({
  enabled,
  pageId,
  basePageVersion,
  initialTitle,
  initialMarkdown,
  pages,
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
  const [generation, setGeneration] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const sessionActiveRef = useRef(false);
  const bindingRef = useRef<CollaborationBinding | null>(null);
  const recoveryStateRef = useRef<Uint8Array | null>(null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  useEffect(() => {
    const handleOnline = () => {
      if (!enabled || !pageId) return;
      if (sessionActiveRef.current) setStatus("reconnecting");
      else setRetryKey((key) => key + 1);
    };
    const handleOffline = () => {
      if (enabled && pageId) setStatus("offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled, pageId]);

  useEffect(() => {
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
      setGeneration(null);
      setReady(false);
      bindingRef.current = null;
      recoveryStateRef.current = null;
      return;
    }
    setError(null);
    setCandidate(null);
    setGeneration(null);
    setReady(false);
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }

    let cancelled = false;
    let destroy: (() => void) | undefined;
    let activeBinding: CollaborationBinding | null = null;
    setStatus("connecting");

    // Hocuspocus/Yjs는 편집 기능 플래그가 켜진 세션에서만 내려받는다. 일반 조회·편집의 초기
    // 번들에 공동 편집 transport를 싣지 않아 현재 사용자 UX를 희생하지 않는다.
    void Promise.all([
      import("./session"),
      getCurrentUser(),
      requestCollaborationTicket(pageId),
    ])
      .then(async ([sessionModule, user, bootstrapTicket]) => {
        if (cancelled) return;
        const state = sessionModule.createCollaborationBootstrapState(initialTitle, initialMarkdown);
        const bootstrap = await bootstrapCollaborationDocument(
          pageId,
          basePageVersion,
          bootstrapTicket.ticket,
          state,
        );
        if (cancelled) return;
        if (bootstrap.basePageVersion !== basePageVersion) {
          throw new Error(
            `공동 초안은 페이지 v${bootstrap.basePageVersion}을 기준으로 합니다. 최신 문서와 병합이 필요합니다.`,
          );
        }
        setGeneration(bootstrap.generation);
        const socketTicket = await requestCollaborationTicket(pageId);
        if (cancelled) return;
        let liveBinding: (CollaborationBinding & { destroy: () => void }) | null = null;
        const session = sessionModule.createCollaborationSession({
          pageId,
          user,
          initialTicket: socketTicket,
          initialState: recoveryStateRef.current ?? undefined,
          issueTicket: requestCollaborationTicket,
          getPages: () => pagesRef.current,
          onStatus: (nextStatus) => {
            if (nextStatus === "synced" && liveBinding && !liveBinding.title.toString().trim()) {
              setStatus("error");
              setError("공동 초안의 제목 형식이 오래되었습니다. 초안을 재설정한 뒤 다시 연결해 주세요.");
              return;
            }
            setStatus(nextStatus);
            if (nextStatus === "synced") setReady(true);
          },
          onParticipants: setParticipants,
          onError: setError,
        });
        recoveryStateRef.current = null;
        liveBinding = session;
        activeBinding = session;
        bindingRef.current = session;
        sessionActiveRef.current = true;
        setCandidate(session);
        destroy = session.destroy;
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(caught instanceof Error
          ? caught.message
          : "공동 편집 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      });

    return () => {
      cancelled = true;
      sessionActiveRef.current = false;
      if (bindingRef.current === activeBinding) bindingRef.current = null;
      destroy?.();
    };
  }, [basePageVersion, enabled, initialMarkdown, initialTitle, pageId, retryKey]);

  const retry = useCallback(() => {
    if (!navigator.onLine) return;
    recoveryStateRef.current = bindingRef.current?.snapshot() ?? null;
    setRetryKey((key) => key + 1);
  }, []);

  return {
    status,
    participants,
    error,
    binding: ready ? candidate : null,
    generation,
    retry,
  };
}
