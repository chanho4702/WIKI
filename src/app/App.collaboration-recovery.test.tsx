import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate, type NavigateFunction } from "react-router";
import { ToastProvider } from "@chanho/react";
import * as Y from "yjs";
import { App } from "./App";
import { __resetForTest, createPage, getPage, updatePage } from "../features/wiki/store/wikiStore";
import type { Page } from "../features/wiki/store/types";
import { createCollaborationBootstrapState } from "../features/wiki/editor/collaboration/session";
import { editorRegistry } from "../features/wiki/editor/editorTestRegistry";
import { buildCollaborationExtensions } from "../features/wiki/editor/extensions/collaboration";
import type { CollaborationBinding } from "../features/wiki/editor/collaboration/session";

const collaborationMock = vi.hoisted(() => ({
  useCollaborationSession: vi.fn(),
}));
vi.mock("../features/wiki/editor/collaboration/useCollaborationSession", () => ({
  COLLABORATION_ENABLED: true,
  useCollaborationSession: collaborationMock.useCollaborationSession,
}));

// getPage만 가로챌 수 있게 감싼다 — 기본은 실제 목업 저장소 그대로다.
const storeControl = vi.hoisted(() => ({
  hold: null as null | { id: string; release: Promise<void> },
  heldCalls: 0,
}));
vi.mock("../features/wiki/store/wikiStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/wiki/store/wikiStore")>();
  return {
    ...actual,
    getPage: async (id: string) => {
      const hold = storeControl.hold;
      if (hold && hold.id === id) {
        storeControl.heldCalls += 1;
        await hold.release;
      }
      return actual.getPage(id);
    },
  };
});

function binding(document: Y.Doc): CollaborationBinding {
  return {
    document,
    provider: null as unknown as CollaborationBinding["provider"],
    extensions: buildCollaborationExtensions({ document }),
    title: document.getText("title"),
    snapshot: () => Y.encodeStateAsUpdate(document),
  };
}

function hookState(overrides: Record<string, unknown>) {
  return {
    status: "synced",
    participants: [],
    error: null,
    binding: null,
    basePageVersion: null,
    generation: 1,
    localCopy: null,
    retry: vi.fn(),
    restart: vi.fn(),
    ...overrides,
  };
}

let navigate: NavigateFunction | null = null;
function NavigatorProbe() {
  navigate = useNavigate();
  return null;
}

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <NavigatorProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function emptyDraft(): Promise<Page> {
  return createPage({ spaceId: "sp1", title: "제목 없음", status: "draft" });
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  editorRegistry.current = null;
  storeControl.hold = null;
  storeControl.heldCalls = 0;
  navigate = null;
  collaborationMock.useCollaborationSession.mockReset();
});

describe("공동 편집 복구 경로 — 초안 자동 삭제", () => {
  it("리셋(stale) 세션에서 닫기는 빈 편집기·빈 서버 초안이어도 자동 삭제하지 않는다", async () => {
    const user = userEvent.setup();
    const draft = await emptyDraft();
    const document = new Y.Doc();
    Y.applyUpdate(document, createCollaborationBootstrapState("제목 없음", ""));
    collaborationMock.useCollaborationSession.mockReturnValue(hookState({
      status: "stale",
      error: "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다",
      binding: binding(document),
    }));
    // 서버 초안은 (이 탭이 아는 한) 여전히 비어 있다 — 리셋 상태라는 것만으로 자동 삭제를 막아야 한다.

    const view = renderAt(`/spaces/sp1/pages/${draft.id}/edit`);
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "닫기" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "닫기" })).not.toBeInTheDocument());
    expect(await getPage(draft.id)).not.toBeNull();
    view.unmount();
    document.destroy();
  });

  it("synced여도 서버 초안이 그사이 채워졌으면 지우지 않는다", async () => {
    const user = userEvent.setup();
    const draft = await emptyDraft();
    const document = new Y.Doc();
    Y.applyUpdate(document, createCollaborationBootstrapState("제목 없음", ""));
    collaborationMock.useCollaborationSession.mockReturnValue(hookState({ binding: binding(document) }));

    const view = renderAt(`/spaces/sp1/pages/${draft.id}/edit`);
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    // 편집 화면을 연 뒤 다른 경로가 서버 초안을 채웠다(이 탭의 편집기는 아직 빈 채).
    await updatePage(draft.id, { body: "다른 경로가 저장한 본문" });
    await user.click(screen.getByRole("button", { name: "닫기" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "닫기" })).not.toBeInTheDocument());
    expect(await getPage(draft.id)).not.toBeNull();
    view.unmount();
    document.destroy();
  });

  it("synced이고 서버·공유 문서 모두 빈 초안이면 닫을 때 지운다(기존 정리 동작 유지)", async () => {
    const user = userEvent.setup();
    const draft = await emptyDraft();
    const document = new Y.Doc();
    Y.applyUpdate(document, createCollaborationBootstrapState("제목 없음", ""));
    collaborationMock.useCollaborationSession.mockReturnValue(hookState({ binding: binding(document) }));

    const view = renderAt(`/spaces/sp1/pages/${draft.id}/edit`);
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "닫기" }));

    await waitFor(async () => expect(await getPage(draft.id)).toBeNull());
    view.unmount();
    document.destroy();
  });
});

describe("공동 편집 복구 경로 — 게시 409", () => {
  it("게시 409는 기준을 자동으로 전진시키지 않고 항상 서버본 비교 패널을 거친다", async () => {
    const user = userEvent.setup();
    const document = new Y.Doc();
    Y.applyUpdate(document, createCollaborationBootstrapState("시작하기", "옛 본문"));
    collaborationMock.useCollaborationSession.mockReturnValue(hookState({
      binding: binding(document),
      // 초안 기준이 서버보다 뒤처져 있다 — 목업 저장소가 409를 낸다.
      basePageVersion: 999,
      generation: 4,
    }));

    const view = renderAt("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "업데이트" }));

    expect(await screen.findByRole("heading", { name: "서버에 저장된 내용" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "이 탭의 편집 내용" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /기준으로 공동 편집 다시 시작$/ })).toBeInTheDocument();
    view.unmount();
    document.destroy();
  });
});

describe("공동 편집 복구 경로 — 페이지 전환 경합", () => {
  it("restart가 A의 최신본을 기다리는 사이 B 편집으로 옮기면 A의 응답을 B에 적용하지 않는다", async () => {
    const user = userEvent.setup();
    const pageB = await createPage({ spaceId: "sp1", title: "B 문서", body: "B 본문" });
    const restart = vi.fn();
    collaborationMock.useCollaborationSession.mockReturnValue(hookState({
      status: "stale",
      error: "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다",
      restart,
    }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    const view = renderAt("/spaces/sp1/pages/pg1/edit");
    // 서버본이 도착해 비교가 열린 뒤의 버튼을 누른다(그 전 버튼은 비교가 열리며 교체된다).
    await screen.findByRole("heading", { name: "서버에 저장된 내용" });
    const restartButton = screen.getByRole("button", { name: /기준으로 공동 편집 다시 시작$/ });

    let release!: () => void;
    storeControl.hold = { id: "pg1", release: new Promise<void>((resolve) => { release = resolve; }) };
    await user.click(restartButton);
    // restart가 실제로 A의 최신본 응답을 기다리는 중이어야 경합을 재현한 것이다.
    await waitFor(() => expect(storeControl.heldCalls).toBe(1));
    act(() => navigate!(`/spaces/sp1/pages/${pageB.id}/edit`));
    await waitFor(() => {
      const last = collaborationMock.useCollaborationSession.mock.calls.at(-1)![0];
      expect(last).toEqual(expect.objectContaining({ pageId: pageB.id, initialTitle: "B 문서" }));
    });

    await act(async () => {
      release();
      await storeControl.hold!.release;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const last = collaborationMock.useCollaborationSession.mock.calls.at(-1)![0];
    expect(last).toEqual(expect.objectContaining({
      pageId: pageB.id,
      initialTitle: "B 문서",
      initialMarkdown: "B 본문",
    }));
    expect(restart).not.toHaveBeenCalled();
    confirm.mockRestore();
    view.unmount();
  });
});
