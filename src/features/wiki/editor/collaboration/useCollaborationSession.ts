import { useCallback, useEffect, useState } from "react";
import { getCurrentUser, requestCollaborationTicket } from "../../store/wikiStore";
import type {
  CollaborationConnectionStatus,
  CollaborationParticipant,
} from "./session";

export const COLLABORATION_ENABLED =
  import.meta.env.VITE_WIKI_COLLABORATION_ENABLED === "true";

interface UseCollaborationSessionOptions {
  enabled: boolean;
  pageId: string | null;
}

export interface CollaborationSessionState {
  status: CollaborationConnectionStatus;
  participants: CollaborationParticipant[];
  error: string | null;
  retry: () => void;
}

export function useCollaborationSession({
  enabled,
  pageId,
}: UseCollaborationSessionOptions): CollaborationSessionState {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [retryKey, setRetryKey] = useState(0);
  const [status, setStatus] = useState<CollaborationConnectionStatus>(
    enabled && pageId ? "connecting" : "disabled",
  );
  const [participants, setParticipants] = useState<CollaborationParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !pageId) {
      setStatus("disabled");
      setParticipants([]);
      setError(null);
      return;
    }
    if (!online) {
      setStatus("offline");
      return;
    }

    let cancelled = false;
    let destroy: (() => void) | undefined;
    setStatus("connecting");
    setError(null);

    // Hocuspocus/Yjs는 편집 기능 플래그가 켜진 세션에서만 내려받는다. 일반 조회·편집의 초기
    // 번들에 공동 편집 transport를 싣지 않아 현재 사용자 UX를 희생하지 않는다.
    void Promise.all([
      import("./session"),
      requestCollaborationTicket(pageId),
      getCurrentUser(),
    ])
      .then(([{ createCollaborationSession }, initialTicket, user]) => {
        if (cancelled) return;
        const session = createCollaborationSession({
          pageId,
          user,
          initialTicket,
          issueTicket: requestCollaborationTicket,
          onStatus: setStatus,
          onParticipants: setParticipants,
          onError: setError,
        });
        destroy = session.destroy;
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setError("공동 편집 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [enabled, online, pageId, retryKey]);

  const retry = useCallback(() => {
    if (navigator.onLine) setRetryKey((key) => key + 1);
  }, []);

  return { status, participants, error, retry };
}
