import { HocuspocusProvider } from "@hocuspocus/provider";
import { Editor, type Extensions } from "@tiptap/core";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import type { CollaborationTicket, Page, User } from "../../store/types";
import { safeParse } from "../markdown";
import { buildCollaborationExtensions } from "../extensions/collaboration";
import { COLLABORATION_TITLE_FIELD } from "./title";

export type CollaborationConnectionStatus =
  | "disabled"
  | "connecting"
  | "syncing"
  | "synced"
  | "reconnecting"
  | "offline"
  | "error";

export interface CollaborationParticipant {
  clientId: number;
  id: string;
  name: string;
  color: string;
}

export interface AwarenessState {
  clientId: number;
  user?: unknown;
}

export interface CollaborationSessionCallbacks {
  onStatus: (status: CollaborationConnectionStatus) => void;
  onParticipants: (participants: CollaborationParticipant[]) => void;
  onError: (message: string) => void;
}

export interface CreateCollaborationSessionOptions extends CollaborationSessionCallbacks {
  pageId: string;
  user: User;
  initialTicket: CollaborationTicket;
  issueTicket: (pageId: string) => Promise<CollaborationTicket>;
  getPages?: () => Page[];
}

export interface CollaborationBinding {
  document: Y.Doc;
  provider: HocuspocusProvider;
  extensions: Extensions;
  title: Y.Text;
}

const WEBSOCKET_PATH = "/api/wiki/collaboration";
const PARTICIPANT_COLORS = [
  "#0c66e4",
  "#7f5f01",
  "#0b6b57",
  "#974f0c",
  "#5e4db2",
  "#ae2a19",
] as const;

/** 서버가 준 경로를 쓰되 같은 API origin의 확정된 WebSocket 경계만 허용한다. */
export function collaborationWebsocketUrl(
  websocketPath: string,
  apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? "",
  origin = window.location.origin,
): string {
  if (websocketPath !== WEBSOCKET_PATH) {
    throw new Error("공동 편집 연결 경로를 확인할 수 없습니다");
  }
  const target = new URL(`${apiBase.replace(/\/+$/, "")}${websocketPath}`, origin);
  if (target.protocol === "https:") target.protocol = "wss:";
  else if (target.protocol === "http:") target.protocol = "ws:";
  else throw new Error("공동 편집 연결 주소를 확인할 수 없습니다");
  return target.toString();
}

export function participantColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return PARTICIPANT_COLORS[hash % PARTICIPANT_COLORS.length];
}

function isParticipant(value: unknown): value is Omit<CollaborationParticipant, "clientId"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string"
    && candidate.id.length > 0
    && candidate.id.length <= 200
    && typeof candidate.name === "string"
    && candidate.name.trim().length > 0
    && Array.from(candidate.name).length <= 200
    // awareness는 다른 클라이언트가 보내는 비신뢰 입력이다. 임의 CSS/url()을 custom property에
    // 주입하지 못하게 우리가 발급하는 팔레트 형식만 허용한다.
    && typeof candidate.color === "string"
    && /^#[0-9a-fA-F]{6}$/.test(candidate.color);
}

/** awareness의 커서 등 다른 필드는 무시하고, 같은 사용자 탭은 한 명으로 합친다. */
export function participantsFromAwareness(
  states: AwarenessState[],
): CollaborationParticipant[] {
  const byUser = new Map<string, CollaborationParticipant>();
  for (const state of states) {
    if (!isParticipant(state.user)) continue;
    if (!byUser.has(state.user.id)) {
      byUser.set(state.user.id, { clientId: state.clientId, ...state.user });
    }
  }
  return [...byUser.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "ko-KR"),
  );
}

function assertTicket(ticket: CollaborationTicket, pageId: string): void {
  if (ticket.room !== `page:${pageId}` || ticket.websocketPath !== WEBSOCKET_PATH) {
    throw new Error("공동 편집 연결 정보를 확인할 수 없습니다");
  }
}

/** 첫 연결에는 이미 발급한 ticket을 쓰고, 이후 인증(재연결)마다 새 1회용 ticket을 발급한다. */
export function createTicketTokenProvider(
  initialTicket: CollaborationTicket,
  pageId: string,
  issueTicket: (pageId: string) => Promise<CollaborationTicket>,
): () => Promise<string> {
  let nextTicket: CollaborationTicket | null = initialTicket;
  return async () => {
    const ticket = nextTicket ?? await issueTicket(pageId);
    nextTicket = null;
    assertTicket(ticket, pageId);
    return ticket.ticket;
  };
}

/** 원자적으로 bootstrap된 Y.Doc transport와 Tiptap/cursor 확장을 한 생명주기로 묶는다. */
export function createCollaborationSession(
  options: CreateCollaborationSessionOptions,
): CollaborationBinding & { destroy: () => void } {
  const {
    pageId,
    user,
    initialTicket,
    issueTicket,
    onStatus,
    onParticipants,
    onError,
    getPages,
  } = options;
  assertTicket(initialTicket, pageId);

  const url = collaborationWebsocketUrl(initialTicket.websocketPath);
  const document = new Y.Doc();
  let hasSynced = false;
  let destroyed = false;
  const nextToken = createTicketTokenProvider(initialTicket, pageId, issueTicket);

  let provider: HocuspocusProvider;
  try {
    provider = new HocuspocusProvider({
      url,
      name: initialTicket.room,
      document,
      token: nextToken,
      onStatus: ({ status }) => {
        if (destroyed) return;
        if (status === "connected") onStatus("syncing");
        if (status === "connecting") onStatus(hasSynced ? "reconnecting" : "connecting");
        if (status === "disconnected") onStatus(hasSynced ? "reconnecting" : "connecting");
      },
      onSynced: ({ state }) => {
        if (destroyed) return;
        if (state) {
          hasSynced = true;
          onStatus("synced");
        } else if (hasSynced) {
          onStatus("reconnecting");
        }
      },
      onAuthenticationFailed: () => {
        if (destroyed) return;
        onStatus("error");
        onError("공동 편집 인증에 실패했습니다. 다시 연결해 주세요.");
      },
      onAwarenessChange: ({ states }) => {
        if (!destroyed) onParticipants(participantsFromAwareness(states));
      },
    });
  } catch (error) {
    document.destroy();
    throw error;
  }

  provider.setAwarenessField("user", {
    id: user.id,
    name: user.name,
    color: participantColor(user.id),
  });
  const extensions = [
    ...buildCollaborationExtensions({ document, getPages }),
    CollaborationCursor.configure({
      provider,
      user: {
        id: user.id,
        name: user.name,
        color: participantColor(user.id),
      },
    }),
  ];

  return {
    provider,
    document,
    extensions,
    title: document.getText(COLLABORATION_TITLE_FIELD),
    destroy: () => {
      destroyed = true;
      provider.destroy();
      document.destroy();
    },
  };
}

/** 현재 Markdown을 collaboration extension이 쓰는 정확한 Y.XmlFragment full-state로 만든다. */
export function createCollaborationBootstrapState(title: string, markdown: string): Uint8Array {
  const document = new Y.Doc();
  document.getText(COLLABORATION_TITLE_FIELD).insert(0, title);
  const editor = new Editor({
    extensions: buildCollaborationExtensions({ document }),
  });
  try {
    editor.commands.setContent(safeParse(markdown));
    return Y.encodeStateAsUpdate(document);
  } finally {
    editor.destroy();
    document.destroy();
  }
}
