import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { Editor, type Extensions } from "@tiptap/core";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import {
  CollaborationDraftResetError,
  type CollaborationTicket,
  type User,
} from "../../store/types";
import type { WikiLinkTarget } from "../../lib/wikiLinks";
import { safeParse, serializeMarkdown } from "../markdown";
import { buildCollaborationExtensions } from "../extensions/collaboration";
import { COLLABORATION_TITLE_FIELD } from "./title";

export type CollaborationConnectionStatus =
  | "disabled"
  | "connecting"
  | "syncing"
  | "synced"
  | "reconnecting"
  | "offline"
  | "error"
  /** 공동 초안이 다른 경로의 저장으로 새로 시작됐다 — 재연결하지 않고 최신 버전 기준 재시작을 기다린다. */
  | "stale";

/** collaboration-service가 stale 초안 연결을 닫을 때 쓰는 close code(공동 초안 리셋). */
export const COLLABORATION_RESET_CLOSE_CODE = 4409;
/**
 * 리셋 때 서버는 먼저 Hocuspocus 문서 CLOSE(provider에는 code 1000 + 이 reason)를 보내고, 이어서 소켓을
 * 4409로 닫는다. 앞의 문서 CLOSE도 같은 reason이면 리셋으로 보고 일찍 멈춘다 — 그 사이 재연결·상태
 * 전이를 시작하지 않기 위해서다. 정본 판정은 여전히 4409다.
 */
export const COLLABORATION_RESET_REASON = "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다";

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
  /** 공동 초안 리셋 감지(close 4409, 재연결 티켓 pageVersion 불일치). 재연결은 이미 멈춘 상태다. */
  onReset: (message: string) => void;
  /** 인증 거부. true를 돌려주면 호출자가 재시도를 맡은 것으로 보고 오류 상태로 바꾸지 않는다. */
  onAuthenticationFailed?: () => boolean;
}

export interface CreateCollaborationSessionOptions extends CollaborationSessionCallbacks {
  pageId: string;
  user: User;
  initialTicket: CollaborationTicket;
  /** 이 세션의 초안 리셋 세대(bootstrap 티켓 기준). 없으면 initialTicket의 값을 쓴다. 재연결 티켓과 대조한다. */
  draftEpoch?: number;
  initialState?: Uint8Array;
  issueTicket: (pageId: string) => Promise<CollaborationTicket>;
  getPages?: () => WikiLinkTarget[];
}

export interface CollaborationBinding {
  document: Y.Doc;
  provider: HocuspocusProvider;
  extensions: Extensions;
  title: Y.Text;
  snapshot: () => Uint8Array;
}

export interface CollaborationSession extends CollaborationBinding {
  destroy: () => void;
  /**
   * provider의 실제 연결·동기화 상태. 브라우저 online/offline 이벤트는 힌트일 뿐이고, 웹소켓이
   * 살아 있으면 provider가 새 이벤트를 내지 않으므로 화면 상태는 이 값으로 다시 맞춘다.
   */
  connectionStatus: () => CollaborationConnectionStatus;
  /** 끊겨 있으면 재시도 대기를 건너뛰고 지금 연결을 시도한다. 연결 중이거나 리셋·종료된 세션은 무시한다. */
  reconnect: () => void;
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

/**
 * bootstrap 직전(세션 시작 시점)에만 쓰는 페이지 버전 대조. 다르면 이 탭이 옛 페이지를 들고 있다.
 * 재연결에는 쓰지 않는다 — 다른 편집자의 정상 게시도 page.version을 올리지만 공동 초안은 그대로 이어진다.
 * pageVersion이 없는 구 서버 응답은 검사하지 않는다.
 */
export function assertTicketPageVersion(ticket: CollaborationTicket, basePageVersion: number): void {
  if (typeof ticket.pageVersion === "number" && ticket.pageVersion !== basePageVersion) {
    throw new CollaborationDraftResetError();
  }
}

/**
 * 재연결 연속성의 정본은 초안 리셋 세대(draftEpoch)다. 리셋할 때만 늘고 게시로는 바뀌지 않으므로, 다르면
 * 공동 초안이 새로 시작된 것이다 — 이 탭의 옛 Y.Doc을 새 초안에 보내면 내용이 중복되므로 연결하지 않는다.
 * 어느 한쪽이라도 값이 없으면(구 서버) 검사하지 않는다 — 오탐으로 멈추는 것보다 기존 동작이 낫다.
 */
export function assertTicketDraftEpoch(
  ticket: CollaborationTicket,
  expectedDraftEpoch: number | undefined,
): void {
  if (
    typeof expectedDraftEpoch === "number"
    && typeof ticket.draftEpoch === "number"
    && ticket.draftEpoch !== expectedDraftEpoch
  ) {
    throw new CollaborationDraftResetError();
  }
}

/** 수동 재연결 스냅샷(Y.Doc update)을 사람이 읽고 복사할 수 있는 제목·Markdown으로 되살린다. */
export function collaborationStateToMarkdown(state: Uint8Array): { title: string; markdown: string } {
  const document = createCollaborationDocument(state);
  const editor = new Editor({ extensions: buildCollaborationExtensions({ document }) });
  try {
    return {
      title: document.getText(COLLABORATION_TITLE_FIELD).toString(),
      markdown: serializeMarkdown(editor.getJSON()),
    };
  } finally {
    editor.destroy();
    document.destroy();
  }
}

/** 첫 연결에는 이미 발급한 ticket을 쓰고, 이후 인증(재연결)마다 새 1회용 ticket을 발급한다. */
export function createTicketTokenProvider(
  initialTicket: CollaborationTicket,
  pageId: string,
  issueTicket: (pageId: string) => Promise<CollaborationTicket>,
  onReset?: (error: CollaborationDraftResetError) => void,
  draftEpoch: number | undefined = initialTicket.draftEpoch,
): () => Promise<string> {
  let nextTicket: CollaborationTicket | null = initialTicket;
  return async () => {
    const ticket = nextTicket ?? await issueTicket(pageId);
    nextTicket = null;
    assertTicket(ticket, pageId);
    try {
      assertTicketDraftEpoch(ticket, draftEpoch);
    } catch (error) {
      if (error instanceof CollaborationDraftResetError) onReset?.(error);
      throw error;
    }
    return ticket.ticket;
  };
}

/** 수동 재연결 때 기존 탭의 미동기화 update까지 새 transport에 이어 붙인다. */
export function createCollaborationDocument(initialState?: Uint8Array): Y.Doc {
  const document = new Y.Doc();
  if (initialState) Y.applyUpdate(document, initialState);
  return document;
}

/** 원자적으로 bootstrap된 Y.Doc transport와 Tiptap/cursor 확장을 한 생명주기로 묶는다. */
export function createCollaborationSession(
  options: CreateCollaborationSessionOptions,
): CollaborationSession {
  const {
    pageId,
    user,
    initialTicket,
    draftEpoch = initialTicket.draftEpoch,
    initialState,
    issueTicket,
    onStatus,
    onParticipants,
    onError,
    onReset,
    getPages,
    onAuthenticationFailed,
  } = options;
  assertTicket(initialTicket, pageId);
  assertTicketDraftEpoch(initialTicket, draftEpoch);

  const url = collaborationWebsocketUrl(initialTicket.websocketPath);
  const document = createCollaborationDocument(initialState);
  let hasSynced = false;
  let destroyed = false;
  // 리셋이 감지된 세션은 다시 연결하지 않는다. 로컬 Y.Doc은 사용자가 편집을 옮길 때까지 에디터에 남긴다.
  let reset = false;
  let provider: HocuspocusProvider | null = null;

  const disconnectedStatus = (): CollaborationConnectionStatus => {
    if (!navigator.onLine) return "offline";
    return hasSynced ? "reconnecting" : "connecting";
  };
  const stopForReset = (message: string) => {
    if (destroyed || reset) return;
    reset = true;
    // 소켓 내부 onClose(재연결 예약)보다 먼저 shouldConnect를 내려야 재연결이 예약되지 않는다.
    const socket = provider?.configuration.websocketProvider;
    if (socket) {
      socket.shouldConnect = false;
      socket.disconnect();
    }
    onStatus("stale");
    onReset(message);
  };
  const nextToken = createTicketTokenProvider(
    initialTicket,
    pageId,
    issueTicket,
    (error) => stopForReset(error.message),
    draftEpoch,
  );

  try {
    provider = new HocuspocusProvider({
      url,
      name: initialTicket.room,
      document,
      token: nextToken,
      onStatus: ({ status }) => {
        if (destroyed || reset) return;
        if (status === "connected") onStatus("syncing");
        if (status === "connecting") onStatus(hasSynced ? "reconnecting" : "connecting");
        if (status === "disconnected") onStatus(disconnectedStatus());
      },
      // provider가 소켓을 직접 만들면 이 콜백이 소켓 내부 onClose(재연결 예약)보다 먼저 등록된다.
      onClose: ({ event }) => {
        const reason = typeof event?.reason === "string" ? event.reason.trim() : "";
        const resetClose = event?.code === COLLABORATION_RESET_CLOSE_CODE
          || (event?.code === 1000 && reason === COLLABORATION_RESET_REASON);
        if (!resetClose) return;
        stopForReset(reason || new CollaborationDraftResetError().message);
      },
      onSynced: ({ state }) => {
        if (destroyed || reset) return;
        if (state) {
          hasSynced = true;
          onStatus("synced");
        } else if (hasSynced) {
          onStatus("reconnecting");
        }
      },
      onAuthenticationFailed: () => {
        // 리셋으로 토큰 발급을 거부한 경우도 이 경로로 오지만, 그건 인증 실패가 아니다.
        if (destroyed || reset) return;
        if (onAuthenticationFailed?.()) return;
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
  const liveProvider = provider;

  liveProvider.setAwarenessField("user", {
    id: user.id,
    name: user.name,
    color: participantColor(user.id),
  });
  const extensions = [
    ...buildCollaborationExtensions({ document, getPages }),
    CollaborationCursor.configure({
      provider: liveProvider,
      user: {
        id: user.id,
        name: user.name,
        color: participantColor(user.id),
      },
    }),
  ];

  return {
    provider: liveProvider,
    document,
    extensions,
    title: document.getText(COLLABORATION_TITLE_FIELD),
    snapshot: () => Y.encodeStateAsUpdate(document),
    destroy: () => {
      destroyed = true;
      liveProvider.destroy();
      document.destroy();
    },
    connectionStatus: () => {
      if (reset) return "stale";
      const socket = liveProvider.configuration.websocketProvider;
      if (socket.status === WebSocketStatus.Connected) {
        return liveProvider.synced ? "synced" : "syncing";
      }
      return disconnectedStatus();
    },
    reconnect: () => {
      if (destroyed || reset) return;
      const socket = liveProvider.configuration.websocketProvider;
      if (socket.status !== WebSocketStatus.Disconnected) return;
      void socket.connect();
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
