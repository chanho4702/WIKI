import type {
  CollaborationConnectionStatus,
  CollaborationParticipant,
} from "../collaboration/session";
import type { CSSProperties } from "react";

export interface CollaborationStatusProps {
  status: CollaborationConnectionStatus;
  participants: CollaborationParticipant[];
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
): string {
  switch (status) {
    case "connecting": return "공동 편집 연결 중";
    case "syncing": return "문서 동기화 중";
    case "synced": return participantCount > 1 ? `${participantCount}명 함께 편집 중` : "나만 편집 중";
    case "reconnecting": return "공동 편집 연결 복구 중";
    case "offline": return "오프라인";
    case "error": return "공동 편집 연결 실패";
    default: return "";
  }
}

export function CollaborationStatus({
  status,
  participants,
  error,
  onRetry,
}: CollaborationStatusProps) {
  if (status === "disabled") return null;
  const label = statusLabel(status, participants.length);
  const visible = participants.slice(0, 3);
  const overflow = participants.length - visible.length;
  const canRetry = status === "error";

  return (
    <div
      className={`collaboration-status collaboration-status--${status}`}
      role="status"
      aria-live="polite"
      aria-label={error ? `${label}. ${error}` : label}
      title={error ?? label}
    >
      <span className="collaboration-status-dot" aria-hidden="true" />
      <span className="collaboration-status-label" aria-hidden="true">{label}</span>
      {status === "synced" && visible.length > 0 ? (
        <span
          className="collaboration-avatars"
          aria-label={`현재 참여자: ${participants.map((participant) => participant.name).join(", ")}`}
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
        </span>
      ) : null}
      {canRetry ? (
        <button className="collaboration-retry" type="button" onClick={onRetry}>
          다시 연결
        </button>
      ) : null}
    </div>
  );
}
