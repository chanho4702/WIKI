import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollaborationDraftResetError, type CollaborationTicket } from "../../store/types";
import type {
  CollaborationConnectionStatus,
  CreateCollaborationSessionOptions,
} from "./session";

const store = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requestCollaborationTicket: vi.fn(),
  bootstrapCollaborationDocument: vi.fn(),
}));
vi.mock("../../store/wikiStore", () => store);

interface FakeSession {
  options: CreateCollaborationSessionOptions;
  status: CollaborationConnectionStatus;
  reconnect: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

const sessionModule = vi.hoisted(() => ({
  created: [] as FakeSession[],
  createCollaborationSession: vi.fn(),
  createCollaborationBootstrapState: vi.fn(() => Uint8Array.from([1])),
  assertTicketPageVersion: vi.fn(),
  assertTicketDraftEpoch: vi.fn(),
  collaborationStateToMarkdown: vi.fn(() => ({ title: "오프라인 제목", markdown: "오프라인에서 쓴 문단" })),
}));
vi.mock("./session", () => sessionModule);

import { useCollaborationSession } from "./useCollaborationSession";

function ticket(pageVersion?: number, draftEpoch?: number): CollaborationTicket {
  return {
    ticket: "t",
    room: "page:7",
    websocketPath: "/api/wiki/collaboration",
    expiresAt: "2026-09-30T10:00:00Z",
    ...(pageVersion === undefined ? {} : { pageVersion }),
    ...(draftEpoch === undefined ? {} : { draftEpoch }),
  };
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
}

const baseOptions = {
  enabled: true,
  pageId: "7",
  basePageVersion: 3,
  initialTitle: "제목",
  initialMarkdown: "본문",
  getLinkTargets: () => [],
};

beforeEach(() => {
  setOnline(true);
  sessionModule.created = [];
  store.getCurrentUser.mockResolvedValue({ id: "u1", name: "김찬호" });
  store.requestCollaborationTicket.mockResolvedValue(ticket(3));
  store.bootstrapCollaborationDocument.mockResolvedValue({
    created: true,
    basePageVersion: 3,
    generation: 1,
  });
  // session.ts와 같은 규칙으로 티켓 버전을 대조한다 — 훅이 이 검사를 bootstrap 전에 부르는지 본다.
  // (vi.importActual로 실제 모듈을 끌어오면 이후 동적 import가 목업 대신 실제 모듈로 풀린다.)
  sessionModule.assertTicketPageVersion.mockImplementation(
    (value: CollaborationTicket, basePageVersion: number) => {
      if (typeof value.pageVersion === "number" && value.pageVersion !== basePageVersion) {
        throw new CollaborationDraftResetError();
      }
    },
  );
  sessionModule.assertTicketDraftEpoch.mockImplementation(
    (value: CollaborationTicket, expected: number | undefined) => {
      if (
        typeof expected === "number"
        && typeof value.draftEpoch === "number"
        && value.draftEpoch !== expected
      ) {
        throw new CollaborationDraftResetError();
      }
    },
  );
  sessionModule.createCollaborationSession.mockImplementation(
    (options: CreateCollaborationSessionOptions) => {
      const document = { title: "제목" };
      const session: FakeSession & Record<string, unknown> = {
        options,
        status: "connecting",
        reconnect: vi.fn(),
        destroy: vi.fn(),
        title: { toString: () => document.title },
        snapshot: () => Uint8Array.from([9, 9]),
        connectionStatus: () => session.status,
      };
      sessionModule.created.push(session);
      return session;
    },
  );
});

afterEach(() => {
  vi.clearAllMocks();
  setOnline(true);
});

async function renderSynced() {
  const view = renderHook(() => useCollaborationSession(baseOptions));
  await waitFor(() => expect(sessionModule.created).toHaveLength(1));
  const session = sessionModule.created[0];
  act(() => {
    session.status = "synced";
    session.options.onStatus("synced");
  });
  expect(view.result.current.status).toBe("synced");
  return { view, session };
}

describe("useCollaborationSession — 브라우저 online/offline", () => {
  it("활성 synced 세션에서 offline → online 뒤 provider 상태(synced)로 돌아온다", async () => {
    const { view, session } = await renderSynced();

    // 웹소켓은 살아 있어 provider가 아무 이벤트도 내지 않는 상황(실측 고착 조건).
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    expect(view.result.current.status).toBe("synced");
    expect(view.result.current.binding).not.toBeNull();
    expect(session.reconnect).toHaveBeenCalled();
    view.unmount();
  });

  it("online 때 provider가 실제로 끊겨 있으면 그 상태를 보이고 재연결을 당긴다", async () => {
    const { view, session } = await renderSynced();
    session.reconnect.mockImplementation(() => {
      session.status = "reconnecting";
    });

    act(() => {
      session.status = "offline";
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(view.result.current.status).toBe("offline");

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(session.reconnect).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe("reconnecting");

    act(() => {
      session.status = "synced";
      session.options.onStatus("synced");
    });
    expect(view.result.current.status).toBe("synced");
    view.unmount();
  });
});

describe("useCollaborationSession — 공동 초안 리셋", () => {
  it("bootstrap 티켓의 pageVersion이 기준과 다르면 bootstrap·연결 없이 stale로 멈춘다", async () => {
    store.requestCollaborationTicket.mockResolvedValue(ticket(4));
    const view = renderHook(() => useCollaborationSession(baseOptions));

    await waitFor(() => expect(view.result.current.status).toBe("stale"));
    expect(view.result.current.error).toBe("공동 초안이 다른 경로의 저장으로 새로 시작되었습니다");
    expect(store.bootstrapCollaborationDocument).not.toHaveBeenCalled();
    expect(sessionModule.createCollaborationSession).not.toHaveBeenCalled();
    view.unmount();
  });

  it("pageVersion이 없는 구 서버 티켓은 그대로 연결한다", async () => {
    store.requestCollaborationTicket.mockResolvedValue(ticket());
    const view = renderHook(() => useCollaborationSession(baseOptions));

    await waitFor(() => expect(sessionModule.created).toHaveLength(1));
    expect(view.result.current.status).not.toBe("stale");
    view.unmount();
  });

  it("bootstrap 409와 기준 버전 불일치는 오류가 아니라 리셋 흐름이다", async () => {
    store.bootstrapCollaborationDocument.mockRejectedValueOnce(new CollaborationDraftResetError());
    const first = renderHook(() => useCollaborationSession(baseOptions));
    await waitFor(() => expect(first.result.current.status).toBe("stale"));
    first.unmount();

    store.bootstrapCollaborationDocument.mockResolvedValueOnce({
      created: false,
      basePageVersion: 5,
      generation: 2,
    });
    const second = renderHook(() => useCollaborationSession(baseOptions));
    await waitFor(() => expect(second.result.current.status).toBe("stale"));
    expect(second.result.current.error).toBe(
      "공동 초안은 페이지 v5을 기준으로 합니다. 최신 문서와 병합이 필요합니다.",
    );
    expect(sessionModule.createCollaborationSession).not.toHaveBeenCalled();
    second.unmount();
  });

  it("세션이 리셋을 알리면 online·다시 연결로 되살리지 않고, restart는 옛 Y.Doc 없이 새로 연다", async () => {
    const { view, session } = await renderSynced();

    act(() => {
      session.status = "stale";
      session.options.onStatus("stale");
      session.options.onReset("공동 초안이 다른 경로의 저장으로 새로 시작되었습니다");
    });
    expect(view.result.current.status).toBe("stale");
    // 편집기는 이 탭의 로컬 문서로 계속 열려 있어야 사용자가 편집을 옮길 수 있다.
    expect(view.result.current.binding).not.toBeNull();

    act(() => {
      window.dispatchEvent(new Event("online"));
      view.result.current.retry();
    });
    expect(session.reconnect).not.toHaveBeenCalled();
    expect(sessionModule.created).toHaveLength(1);
    expect(view.result.current.status).toBe("stale");

    act(() => view.result.current.restart());
    await waitFor(() => expect(sessionModule.created).toHaveLength(2));
    expect(session.destroy).toHaveBeenCalled();
    expect(sessionModule.created[1].options.initialState).toBeUndefined();
    view.unmount();
  });

  it("인증 거부는 restart 직후 한 번만 새 세션으로 재시도하고, 그 뒤에는 오류로 멈춘다", async () => {
    const { view, session } = await renderSynced();
    // restart 전의 인증 거부는 재시도 대상이 아니다.
    expect(session.options.onAuthenticationFailed?.()).toBe(false);

    act(() => {
      session.options.onStatus("stale");
      session.options.onReset("공동 초안이 다른 경로의 저장으로 새로 시작되었습니다");
    });
    act(() => view.result.current.restart());
    await waitFor(() => expect(sessionModule.created).toHaveLength(2));

    let handled: boolean | undefined;
    act(() => {
      handled = sessionModule.created[1].options.onAuthenticationFailed?.();
    });
    expect(handled).toBe(true);
    expect(view.result.current.status).toBe("connecting");
    await waitFor(() => expect(sessionModule.created).toHaveLength(3), { timeout: 3000 });
    expect(sessionModule.created[2].options.initialState).toBeUndefined();

    // 두 번째 거부는 넘기지 않는다 — 세션이 오류 상태를 띄운다(무한 재시도 금지).
    expect(sessionModule.created[2].options.onAuthenticationFailed?.()).toBe(false);
    view.unmount();
  });

  it("같은 기준 버전의 수동 재연결은 이 탭의 로컬 스냅샷을 잇는다", async () => {
    const view = renderHook(() => useCollaborationSession(baseOptions));
    await waitFor(() => expect(sessionModule.created).toHaveLength(1));
    act(() => {
      sessionModule.created[0].options.onStatus("synced");
    });

    act(() => view.result.current.retry());
    await waitFor(() => expect(sessionModule.created).toHaveLength(2));
    expect(sessionModule.created[1].options.initialState).toEqual(Uint8Array.from([9, 9]));
    view.unmount();
  });

  it("재연결 스냅샷이 있는 탭이 retry 때 draftEpoch 변경을 만나면 조용히 새로 열지 않고 로컬 사본과 함께 stale로 멈춘다", async () => {
    store.requestCollaborationTicket.mockResolvedValue(ticket(3, 1));
    const view = renderHook(() => useCollaborationSession(baseOptions));
    await waitFor(() => expect(sessionModule.created).toHaveLength(1));
    act(() => {
      sessionModule.created[0].options.onStatus("synced");
    });

    // 인증 오류 뒤 "다시 연결" — 그사이 공동 초안이 리셋됐다(epoch 1 → 2).
    act(() => {
      sessionModule.created[0].options.onStatus("error");
    });
    store.requestCollaborationTicket.mockResolvedValue(ticket(3, 2));
    act(() => view.result.current.retry());

    await waitFor(() => expect(view.result.current.status).toBe("stale"));
    expect(sessionModule.created).toHaveLength(1);
    expect(store.bootstrapCollaborationDocument).toHaveBeenCalledTimes(1);
    expect(sessionModule.collaborationStateToMarkdown).toHaveBeenCalledWith(Uint8Array.from([9, 9]));
    expect(view.result.current.localCopy).toEqual({
      title: "오프라인 제목",
      markdown: "오프라인에서 쓴 문단",
    });

    // 사용자가 명시적으로 다시 시작해야 사본을 비우고 새 세션을 연다(옛 스냅샷 없이).
    act(() => view.result.current.restart());
    await waitFor(() => expect(sessionModule.created).toHaveLength(2));
    expect(sessionModule.created[1].options.initialState).toBeUndefined();
    expect(view.result.current.localCopy).toBeNull();
    view.unmount();
  });

  it("retry로 미게시 편집을 이어 받은 세션이 첫 synced 전에 리셋되면 그 편집을 사본으로 남긴다", async () => {
    store.requestCollaborationTicket.mockResolvedValue(ticket(3, 1));
    const view = renderHook(() => useCollaborationSession(baseOptions));
    await waitFor(() => expect(sessionModule.created).toHaveLength(1));
    act(() => {
      sessionModule.created[0].options.onStatus("synced");
    });

    act(() => view.result.current.retry());
    await waitFor(() => expect(sessionModule.created).toHaveLength(2));
    const retried = sessionModule.created[1];
    expect(retried.options.initialState).toEqual(Uint8Array.from([9, 9]));
    // 첫 synced 전 — 편집기는 아직 노출되지 않았다 — 에 4409 리셋이 온다.
    expect(view.result.current.binding).toBeNull();
    act(() => {
      retried.options.onStatus("stale");
      retried.options.onReset("공동 초안이 다른 경로의 저장으로 새로 시작되었습니다");
    });

    expect(view.result.current.status).toBe("stale");
    expect(sessionModule.collaborationStateToMarkdown).toHaveBeenCalledWith(Uint8Array.from([9, 9]));
    expect(view.result.current.localCopy).toEqual({
      title: "오프라인 제목",
      markdown: "오프라인에서 쓴 문단",
    });
    view.unmount();
  });

  it("같은 기준 버전·같은 draftEpoch의 수동 재연결은 스냅샷을 잇는다", async () => {
    store.requestCollaborationTicket.mockResolvedValue(ticket(3, 1));
    const view = renderHook(() => useCollaborationSession(baseOptions));
    await waitFor(() => expect(sessionModule.created).toHaveLength(1));
    expect(sessionModule.created[0].options.draftEpoch).toBe(1);
    act(() => {
      sessionModule.created[0].options.onStatus("synced");
    });

    act(() => view.result.current.retry());
    await waitFor(() => expect(sessionModule.created).toHaveLength(2));
    expect(sessionModule.created[1].options.initialState).toEqual(Uint8Array.from([9, 9]));
    view.unmount();
  });

  it("다른 편집자의 정상 게시로 pageVersion만 앞선(같은 draftEpoch) 재연결은 리셋이 아니라 새 기준으로 이어 간다", async () => {
    store.requestCollaborationTicket.mockResolvedValue(ticket(3, 1));
    const view = renderHook(() => useCollaborationSession(baseOptions));
    await waitFor(() => expect(sessionModule.created).toHaveLength(1));
    act(() => {
      sessionModule.created[0].options.onStatus("synced");
    });
    expect(view.result.current.basePageVersion).toBe(3);

    store.requestCollaborationTicket.mockResolvedValue(ticket(4, 1));
    store.bootstrapCollaborationDocument.mockResolvedValue({
      created: false,
      basePageVersion: 4,
      generation: 2,
    });
    act(() => view.result.current.retry());

    await waitFor(() => expect(sessionModule.created).toHaveLength(2));
    expect(view.result.current.status).not.toBe("stale");
    expect(store.bootstrapCollaborationDocument).toHaveBeenLastCalledWith(
      "7", 4, "t", expect.any(Uint8Array),
    );
    // 세션 기준(옵션 base 3)은 그대로라 로컬 스냅샷도 부당하게 버리지 않는다.
    expect(sessionModule.created[1].options.initialState).toEqual(Uint8Array.from([9, 9]));
    expect(view.result.current.basePageVersion).toBe(4);
    expect(view.result.current.generation).toBe(2);
    view.unmount();
  });

  it("스냅샷을 든 채 기준 페이지 버전이 바뀌면 옛 스냅샷을 합치지 않고 리셋 흐름으로 사본을 남긴다", async () => {
    let options = baseOptions;
    const view = renderHook(() => useCollaborationSession(options));
    await waitFor(() => expect(sessionModule.created).toHaveLength(1));
    act(() => {
      sessionModule.created[0].options.onStatus("synced");
    });

    store.requestCollaborationTicket.mockResolvedValue(ticket(4));
    act(() => {
      view.result.current.retry();
      options = { ...baseOptions, basePageVersion: 4, initialMarkdown: "최신 본문" };
      view.rerender();
    });
    await waitFor(() => expect(view.result.current.status).toBe("stale"));
    expect(sessionModule.created).toHaveLength(1);
    expect(view.result.current.localCopy).not.toBeNull();
    view.unmount();
  });
});
