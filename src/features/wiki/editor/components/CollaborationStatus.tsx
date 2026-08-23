import type {
  CollaborationConnectionStatus,
  CollaborationParticipant,
} from "../collaboration/session";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useDismissablePopover } from "../../lib/useDismissablePopover";

export interface CollaborationStatusProps {
  status: CollaborationConnectionStatus;
  participants: CollaborationParticipant[];
  hasLocalDocument?: boolean;
  error?: string | null;
  onRetry: () => void;
}

function initials(name: string): string {
  const normalized = name.trim();
  if (!normalized) return "?";
  const words = normalized.split(/\s+/);
  return words.length > 1
    ? `${Array.from(words[0])[0] ?? ""}${Array.from(words.at(-1)!)[0] ?? ""}`
    : Array.from(normalized).slice(0, 2).join("");
}

function statusLabel(
  status: CollaborationConnectionStatus,
  participantCount: number,
  hasLocalDocument: boolean,
): string {
  switch (status) {
    case "connecting": return "공동 편집 연결 중";
    case "syncing": return "최신 변경 동기화 중";
    case "synced": return participantCount > 1 ? `${participantCount}명 함께 편집 중` : "나만 편집 중";
    case "reconnecting": return hasLocalDocument
      ? "재연결 중 · 이 탭에 임시 보관"
      : "공동 편집 연결 복구 중";
    case "offline": return hasLocalDocument
      ? "오프라인 · 이 탭에 임시 보관"
      : "오프라인";
    case "error": return hasLocalDocument
      ? "연결 끊김 · 이 탭에 임시 보관"
      : "공동 편집 연결 실패";
    default: return "";
  }
}

export function CollaborationStatus({
  status,
  participants,
  hasLocalDocument = false,
  error,
  onRetry,
}: CollaborationStatusProps) {
  const [presenceOpen, setPresenceOpen] = useState(false);
  const presenceRef = useRef<HTMLDivElement>(null);
  const presenceTriggerRef = useRef<HTMLButtonElement>(null);
  const presencePanelId = useId();
  const presenceAvailable = status === "synced" && participants.length > 0;
  const presenceVisible = presenceAvailable && presenceOpen;
  const closePresence = useCallback(() => setPresenceOpen(false), []);
  useDismissablePopover({
    containerRef: presenceRef,
    triggerRef: presenceTriggerRef,
    open: presenceVisible,
    onClose: closePresence,
  });
  useEffect(() => {
    if (!presenceAvailable) setPresenceOpen(false);
  }, [presenceAvailable]);

  if (status === "disabled") return null;
  const label = statusLabel(status, participants.length, hasLocalDocument);
  const visible = participants.slice(0, 3);
  const overflow = participants.length - visible.length;
  const canRetry = status === "error";
  const participantNames = participants.map((participant) => participant.name).join(", ");

  return (
    <div
      className={`collaboration-status collaboration-status--${status}`}
    >
      <span
        className="collaboration-status-signal"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={error ? `${label}. ${error}` : label}
        title={error ?? label}
      >
        <span className="collaboration-status-dot" aria-hidden="true" />
        <span className="collaboration-status-label" aria-hidden="true">{label}</span>
      </span>
      {status === "synced" && visible.length > 0 ? (
        <div className="collaboration-presence" ref={presenceRef}>
          <button
            ref={presenceTriggerRef}
            className="collaboration-avatars"
            type="button"
            aria-expanded={presenceVisible}
            aria-controls={presencePanelId}
            aria-label={`현재 참여자 ${participants.length}명 보기: ${participantNames}`}
            onClick={() => setPresenceOpen((open) => !open)}
          >
            {visible.map((participant) => (
              <span
                className="collaboration-avatar"
                key={participant.id}
                style={{ "--collaboration-avatar-color": participant.color } as CSSProperties}
                title={participant.name}
                aria-hidden="true"
              >
                {initials(participant.name)}
              </span>
            ))}
            {overflow > 0 ? (
              <span className="collaboration-avatar collaboration-avatar--overflow" aria-hidden="true">
                +{overflow}
              </span>
            ) : null}
          </button>
          {presenceVisible ? (
            <div
              className="collaboration-presence-panel"
              id={presencePanelId}
              role="group"
              aria-label="현재 공동 편집 참여자"
            >
              <div className="collaboration-presence-heading">
                <strong>현재 편집 중</strong>
                <span>{participants.length}명</span>
              </div>
              <ul>
                {participants.map((participant) => (
                  <li key={participant.id}>
                    <span
                      className="collaboration-participant-avatar"
                      style={{ "--collaboration-avatar-color": participant.color } as CSSProperties}
                      aria-hidden="true"
                    >
                      {initials(participant.name)}
                    </span>
                    <span className="collaboration-participant-name" title={participant.name}>
                      {participant.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {canRetry ? (
        <button className="collaboration-retry" type="button" onClick={onRetry}>
          다시 연결
        </button>
      ) : null}
    </div>
  );
}
