import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COLLABORATION_RESET_CLOSE_CODE,
  COLLABORATION_RESET_REASON,
  createCollaborationSession,
  createTicketTokenProvider,
  type CollaborationConnectionStatus,
} from "./session";
import { CollaborationDraftResetError, type CollaborationTicket } from "../../store/types";

/** Hocuspocus가 기본값으로 집는 전역 WebSocket을 대신한다 — 실제 네트워크 없이 close 이벤트를 흉내낸다. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  binaryType = "arraybuffer";
  identifier = 0;
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(name: string, listener: (event: unknown) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(listener);
  }

  removeEventListener(name: string, listener: (event: unknown) => void) {
    this.listeners.get(name)?.delete(listener);
  }

  sent: Uint8Array[] = [];

  send(data: Uint8Array) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  dispatch(name: string, event: unknown) {
    if (name === "open") this.readyState = 1;
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener(event);
  }
}

/** Hocuspocus 프레임: varString(문서) + varUint(메시지 타입) + 본문. 테스트 값은 모두 varUint 한 바이트 범위다. */
function varUint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest > 0x7f) {
    bytes.push((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  bytes.push(rest);
  return bytes;
}

function varString(value: string): number[] {
  const encoded = [...new TextEncoder().encode(value)];
  return [...varUint(encoded.length), ...encoded];
}

function frame(...parts: number[][]): { data: ArrayBuffer } {
  return { data: Uint8Array.from(parts.flat()).buffer };
}

const MESSAGE_AUTH = 2;
const MESSAGE_CLOSE = 7;
const MESSAGE_PING = 9;
const AUTH_PERMISSION_DENIED = 1;

function ticket(overrides: Partial<CollaborationTicket> = {}): CollaborationTicket {
  return {
    ticket: "first-ticket",
    room: "page:7",
    websocketPath: "/api/wiki/collaboration",
    expiresAt: "2026-09-30T10:00:00Z",
    ...overrides,
  };
}

function openSession(
  onReset = vi.fn(),
  extra: { onAuthenticationFailed?: () => boolean; onError?: (message: string) => void } = {},
) {
  const statuses: CollaborationConnectionStatus[] = [];
  const session = createCollaborationSession({
    ...extra,
    pageId: "7",
    user: { id: "u1", name: "김찬호" } as never,
    initialTicket: ticket({ pageVersion: 3 }),
    issueTicket: async () => ticket({ ticket: "fresh", pageVersion: 3 }),
    onStatus: (status) => statuses.push(status),
    onParticipants: () => {},
    onError: extra.onError ?? (() => {}),
    onReset,
  });
  return { session, statuses, onReset };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("공동 초안 리셋 — 재연결 티켓(draftEpoch가 정본)", () => {
  it("재연결 티켓이 pageVersion+1이어도 draftEpoch가 같으면(정상 게시) 토큰을 내준다", async () => {
    const onReset = vi.fn();
    const token = createTicketTokenProvider(
      ticket({ pageVersion: 3, draftEpoch: 2 }),
      "7",
      async () => ticket({ ticket: "fresh", pageVersion: 4, draftEpoch: 2 }),
      onReset,
    );

    await expect(token()).resolves.toBe("first-ticket");
    await expect(token()).resolves.toBe("fresh");
    expect(onReset).not.toHaveBeenCalled();
  });

  it("페이지 버전이 같아도 재연결 티켓의 draftEpoch가 달라졌으면 리셋이다", async () => {
    const onReset = vi.fn();
    const token = createTicketTokenProvider(
      ticket({ pageVersion: 3, draftEpoch: 2 }),
      "7",
      async () => ticket({ ticket: "fresh", pageVersion: 3, draftEpoch: 3 }),
      onReset,
    );

    await expect(token()).resolves.toBe("first-ticket");
    await expect(token()).rejects.toBeInstanceOf(CollaborationDraftResetError);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("draftEpoch가 없는 티켓(구 서버)은 검사하지 않는다 — pageVersion이 달라도 오탐으로 멈추지 않는다", async () => {
    const onReset = vi.fn();
    const token = createTicketTokenProvider(
      ticket({ pageVersion: 3, draftEpoch: 2 }),
      "7",
      async () => ticket({ ticket: "fresh", pageVersion: 4 }),
      onReset,
    );

    await expect(token()).resolves.toBe("first-ticket");
    await expect(token()).resolves.toBe("fresh");
    expect(onReset).not.toHaveBeenCalled();
  });

  it("bootstrap 뒤 첫 소켓 티켓의 draftEpoch가 세션 기준과 다르면 소켓을 열지 않는다", () => {
    expect(() => createCollaborationSession({
      pageId: "7",
      user: { id: "u1", name: "김찬호" } as never,
      initialTicket: ticket({ pageVersion: 3, draftEpoch: 1 }),
      draftEpoch: 0,
      issueTicket: async () => ticket(),
      onStatus: () => {},
      onParticipants: () => {},
      onError: () => {},
      onReset: () => {},
    })).toThrow(CollaborationDraftResetError);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("첫 소켓 티켓의 pageVersion이 앞서 있어도 draftEpoch가 같으면 세션을 연다", () => {
    const session = createCollaborationSession({
      pageId: "7",
      user: { id: "u1", name: "김찬호" } as never,
      initialTicket: ticket({ pageVersion: 5, draftEpoch: 1 }),
      draftEpoch: 1,
      issueTicket: async () => ticket(),
      onStatus: () => {},
      onParticipants: () => {},
      onError: () => {},
      onReset: () => {},
    });
    expect(session.connectionStatus()).not.toBe("stale");
    session.destroy();
  });
});

describe("공동 초안 리셋 — close 4409", () => {
  it("4409로 닫히면 재연결하지 않고 stale 상태로 리셋을 알린다", async () => {
    const { session, statuses, onReset } = openSession();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0].dispatch("close", {
      code: COLLABORATION_RESET_CLOSE_CODE,
      reason: "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다",
    });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(onReset).toHaveBeenCalledWith("공동 초안이 다른 경로의 저장으로 새로 시작되었습니다");
    expect(statuses.at(-1)).toBe("stale");
    expect(session.connectionStatus()).toBe("stale");
    // 옛 Y.Doc을 새 초안에 보내지 않도록 새 소켓 자체를 열지 않는다.
    expect(FakeWebSocket.instances).toHaveLength(1);
    session.reconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    session.destroy();
  });

  it("서버 순서(문서 CLOSE 1000+reason → 소켓 4409)대로 와도 사이에 재연결·상태 전이가 없다", async () => {
    const { session, statuses, onReset } = openSession();
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeWebSocket.instances[0];
    socket.dispatch("open", {});
    // 첫 수신 프레임(Ping)이 연결 시도를 확정한다 — 연결 확립에 따른 상태 전이는 여기서 끝낸다.
    socket.dispatch("message", frame([MESSAGE_PING]));
    await vi.advanceTimersByTimeAsync(0);
    const before = statuses.length;

    socket.dispatch("message", frame(
      varString("page:7"),
      varUint(MESSAGE_CLOSE),
      varString(COLLABORATION_RESET_REASON),
    ));
    // 문서 CLOSE만으로 이미 리셋으로 멈춘다 — 4409를 기다리는 동안 "재연결 중"으로 바뀌지 않는다.
    expect(onReset).toHaveBeenCalledWith(COLLABORATION_RESET_REASON);
    expect(statuses.slice(before)).toEqual(["stale"]);

    socket.dispatch("close", { code: COLLABORATION_RESET_CLOSE_CODE, reason: COLLABORATION_RESET_REASON });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(statuses.slice(before)).toEqual(["stale"]);
    expect(session.connectionStatus()).toBe("stale");
    expect(FakeWebSocket.instances).toHaveLength(1);
    session.destroy();
  });

  it("리셋 reason이 아닌 문서 CLOSE(1000)는 리셋으로 보지 않는다", async () => {
    const { session, onReset } = openSession();
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeWebSocket.instances[0];
    socket.dispatch("open", {});
    await vi.advanceTimersByTimeAsync(0);

    socket.dispatch("message", frame(varString("page:7"), varUint(MESSAGE_CLOSE), varString("bye")));

    expect(onReset).not.toHaveBeenCalled();
    expect(session.connectionStatus()).not.toBe("stale");
    session.destroy();
  });

  it("인증 거부는 호출자가 재시도를 맡으면(true) 오류 상태로 바꾸지 않는다", async () => {
    const onError = vi.fn();
    const onAuthenticationFailed = vi.fn(() => true);
    const { session, statuses } = openSession(vi.fn(), { onAuthenticationFailed, onError });
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeWebSocket.instances[0];
    socket.dispatch("open", {});
    await vi.advanceTimersByTimeAsync(0);

    socket.dispatch("message", frame(
      varString("page:7"),
      varUint(MESSAGE_AUTH),
      varUint(AUTH_PERMISSION_DENIED),
      varString("old document still loaded"),
    ));

    expect(onAuthenticationFailed).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(statuses).not.toContain("error");

    onAuthenticationFailed.mockReturnValue(false);
    socket.dispatch("message", frame(
      varString("page:7"),
      varUint(MESSAGE_AUTH),
      varUint(AUTH_PERMISSION_DENIED),
      varString("denied"),
    ));
    expect(onError).toHaveBeenCalledWith("공동 편집 인증에 실패했습니다. 다시 연결해 주세요.");
    expect(statuses.at(-1)).toBe("error");
    session.destroy();
  });

  it("재연결 티켓의 draftEpoch만 달라져도(버전 불변 리셋) 소켓을 닫고 stale로 멈춘다", async () => {
    const onReset = vi.fn();
    const session = createCollaborationSession({
      pageId: "7",
      user: { id: "u1", name: "김찬호" } as never,
      initialTicket: ticket({ pageVersion: 3, draftEpoch: 4 }),
        issueTicket: async () => ticket({ ticket: "fresh", pageVersion: 3, draftEpoch: 5 }),
      onStatus: () => {},
      onParticipants: () => {},
      onError: () => {},
      onReset,
    });
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].dispatch("open", {});
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].dispatch("close", { code: 1006, reason: "" });
    await vi.advanceTimersByTimeAsync(5_000);
    FakeWebSocket.instances.at(-1)!.dispatch("open", {});
    await vi.advanceTimersByTimeAsync(0);

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(session.connectionStatus()).toBe("stale");
    const sockets = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(sockets);
    session.destroy();
  });

  it("다른 편집자의 정상 게시 뒤(재연결 티켓 pageVersion+1, 같은 draftEpoch) 재연결은 리셋이 아니다", async () => {
    const onReset = vi.fn();
    let issued = 0;
    const session = createCollaborationSession({
      pageId: "7",
      user: { id: "u1", name: "김찬호" } as never,
      initialTicket: ticket({ pageVersion: 3, draftEpoch: 4 }),
        issueTicket: async () => {
        issued += 1;
        return ticket({ ticket: "fresh", pageVersion: 4, draftEpoch: 4 });
      },
      onStatus: () => {},
      onParticipants: () => {},
      onError: () => {},
      onReset,
    });
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].dispatch("open", {});
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].dispatch("close", { code: 1006, reason: "" });
    await vi.advanceTimersByTimeAsync(5_000);
    const reconnecting = FakeWebSocket.instances.at(-1)!;
    reconnecting.dispatch("open", {});
    await vi.advanceTimersByTimeAsync(0);

    expect(issued).toBe(1);
    expect(onReset).not.toHaveBeenCalled();
    expect(session.connectionStatus()).not.toBe("stale");
    // 새 티켓으로 인증 메시지를 보내 정상 재연결을 이어 간다.
    expect(reconnecting.sent.some((frame) => new TextDecoder().decode(frame).includes("fresh"))).toBe(true);
    session.destroy();
  });

  it("일반 단절(1006)은 리셋이 아니라 재연결을 시도한다", async () => {
    const { session, onReset } = openSession();
    await vi.advanceTimersByTimeAsync(0);

    FakeWebSocket.instances[0].dispatch("close", { code: 1006, reason: "" });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(onReset).not.toHaveBeenCalled();
    expect(session.connectionStatus()).not.toBe("stale");
    expect(FakeWebSocket.instances.length).toBeGreaterThan(1);
    session.destroy();
  });

  it("구 서버(draftEpoch 없음)에서 재연결 티켓의 pageVersion만 달라지면 멈추지 않고 재연결한다", async () => {
    const onReset = vi.fn();
    let issued = 0;
    const session = createCollaborationSession({
      pageId: "7",
      user: { id: "u1", name: "김찬호" } as never,
      initialTicket: ticket({ pageVersion: 3 }),
      issueTicket: async () => {
        issued += 1;
        return ticket({ ticket: "fresh", pageVersion: 4 });
      },
      onStatus: () => {},
      onParticipants: () => {},
      onError: () => {},
      onReset,
    });
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].dispatch("open", {});
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].dispatch("close", { code: 1006, reason: "" });
    await vi.advanceTimersByTimeAsync(5_000);
    const reconnecting = FakeWebSocket.instances.at(-1)!;
    reconnecting.dispatch("open", {});
    await vi.advanceTimersByTimeAsync(0);

    expect(issued).toBe(1);
    expect(onReset).not.toHaveBeenCalled();
    expect(session.connectionStatus()).not.toBe("stale");
    expect(reconnecting.sent.some((frame) => new TextDecoder().decode(frame).includes("fresh"))).toBe(true);
    session.destroy();
  });
});
