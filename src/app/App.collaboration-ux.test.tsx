import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as Y from "yjs";
import { renderApp } from "./testUtils";
import { __resetForTest, createPage, getPage } from "../features/wiki/store/wikiStore";
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

function reconnectingBinding(document: Y.Doc): CollaborationBinding {
  return {
    document,
    provider: null as unknown as CollaborationBinding["provider"],
    extensions: buildCollaborationExtensions({ document }),
    title: document.getText("title"),
    snapshot: () => Y.encodeStateAsUpdate(document),
  };
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  editorRegistry.current = null;
  collaborationMock.useCollaborationSession.mockReset();
});

describe("공동 편집 연결 복구 UX", () => {
  it("로컬 편집은 유지하되 서버 동기화 전 업데이트는 막는다", async () => {
    const user = userEvent.setup();
    const document = new Y.Doc();
    document.getText("title").insert(0, "시작하기");
    collaborationMock.useCollaborationSession.mockReturnValue({
      status: "reconnecting",
      participants: [],
      error: null,
      binding: reconnectingBinding(document),
      generation: 4,
      retry: vi.fn(),
    });

    const view = renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());

    expect(screen.getByRole("status", {
      name: "재연결 중 · 이 탭에 임시 보관",
    })).toBeInTheDocument();
    const titleField = screen.getByRole("textbox", { name: "페이지 제목" });
    expect(titleField).toBeEnabled();
    expect(screen.getByRole("button", { name: "업데이트" })).toBeDisabled();

    await user.type(titleField, " 오프라인 변경");
    expect(titleField).toHaveValue("시작하기 오프라인 변경");
    expect(screen.getByRole("button", { name: "업데이트" })).toBeDisabled();

    view.unmount();
    document.destroy();
  });

  it("공동 초안이 리셋되면 서버 최신본과 이 탭의 편집을 보여 주고, 확인해야 최신 버전 기준으로 다시 시작한다", async () => {
    const user = userEvent.setup();
    const document = new Y.Doc();
    document.getText("title").insert(0, "시작하기");
    const restart = vi.fn();
    const staleState = {
      status: "stale",
      participants: [],
      error: "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다",
      binding: reconnectingBinding(document),
      generation: 4,
      retry: vi.fn(),
      restart,
    };
    collaborationMock.useCollaborationSession.mockReturnValue(staleState);
    const confirm = vi.spyOn(window, "confirm");

    const view = renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());

    expect(await screen.findByRole("heading", {
      name: "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다",
    })).toBeInTheDocument();
    expect(screen.getByRole("status", {
      name: "공동 초안 새로 시작됨 · 이 탭에 임시 보관. 공동 초안이 다른 경로의 저장으로 새로 시작되었습니다",
    })).toBeInTheDocument();
    // 서버본이 도착하면 비교가 열리고, 내 편집은 사라지지 않고 옆에 남는다.
    expect(await screen.findByRole("heading", { name: "서버에 저장된 내용" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "이 탭의 편집 내용" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "서버본으로 다시 불러오기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /병합 계속/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "업데이트" })).toBeDisabled();

    const restartButton = screen.getByRole("button", { name: /^서버 v\d+ 기준으로 공동 편집 다시 시작$/ });
    confirm.mockReturnValueOnce(false);
    await user.click(restartButton);
    expect(restart).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "이 탭의 편집 내용" })).toBeInTheDocument();

    collaborationMock.useCollaborationSession.mockReturnValue({
      ...staleState,
      status: "connecting",
      error: null,
      binding: null,
      generation: null,
    });
    confirm.mockReturnValueOnce(true);
    await user.click(restartButton);
    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenLastCalledWith(
      "이 탭의 편집 내용은 새 공동 문서에 합쳐지지 않습니다. 옮길 내용을 복사해 두었다면 서버 최신본 기준으로 공동 편집을 다시 시작하시겠습니까?",
    );
    await waitFor(() => expect(screen.queryByRole("heading", {
      name: "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다",
    })).not.toBeInTheDocument());

    confirm.mockRestore();
    view.unmount();
    document.destroy();
  });

  it("리셋으로 편집기를 잃었으면 훅이 스냅샷에서 되살린 사본을 비교 칸에 보여 준다", async () => {
    collaborationMock.useCollaborationSession.mockReturnValue({
      status: "stale",
      participants: [],
      error: "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다",
      binding: null,
      basePageVersion: null,
      generation: null,
      localCopy: { title: "오프라인 제목", markdown: "오프라인에서 쓴 문단" },
      retry: vi.fn(),
      restart: vi.fn(),
    });

    const view = renderApp("/spaces/sp1/pages/pg1/edit");

    expect(await screen.findByRole("heading", { name: "이 탭의 편집 내용" })).toBeInTheDocument();
    expect(screen.getByText("오프라인 제목")).toBeInTheDocument();
    expect(screen.getByText("오프라인에서 쓴 문단")).toBeInTheDocument();
    view.unmount();
  });

  it("되살린 사본만 남은 상태에서 닫으면 미저장 경고로 막는다 — 유일한 편집이 조용히 사라지지 않는다", async () => {
    const user = userEvent.setup();
    collaborationMock.useCollaborationSession.mockReturnValue({
      status: "stale",
      participants: [],
      error: "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다",
      binding: null,
      basePageVersion: null,
      generation: null,
      localCopy: { title: "오프라인 제목", markdown: "오프라인에서 쓴 문단" },
      retry: vi.fn(),
      restart: vi.fn(),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    const view = renderApp("/spaces/sp1/pages/pg1/edit");
    await screen.findByRole("heading", { name: "이 탭의 편집 내용" });
    await user.click(screen.getByRole("button", { name: "닫기" }));

    expect(confirm).toHaveBeenCalledWith("저장하지 않은 변경이 있습니다. 나가시겠습니까?");
    expect(screen.getByText("오프라인에서 쓴 문단")).toBeInTheDocument();
    confirm.mockRestore();
    view.unmount();
  });

  it("공동 편집 게시는 dirty 여부와 무관하게 공유 문서(제목·본문)를 보낸다 — 불러올 때의 본문으로 덮지 않는다", async () => {
    const user = userEvent.setup();
    // 다른 편집자의 게시·재연결 뒤처럼, 공유 Y.Doc이 화면이 처음 불러온 본문과 다른 상태.
    const document = new Y.Doc();
    Y.applyUpdate(document, createCollaborationBootstrapState("공유 제목", "공유 문서의 최신 본문"));
    collaborationMock.useCollaborationSession.mockReturnValue({
      status: "synced",
      participants: [],
      error: null,
      binding: reconnectingBinding(document),
      basePageVersion: null,
      generation: 4,
      localCopy: null,
      retry: vi.fn(),
      restart: vi.fn(),
    });

    const view = renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    // 사용자는 아무것도 고치지 않고 곧바로 게시한다(편집기 isDirty() === false).
    await user.click(screen.getByRole("button", { name: "업데이트" }));

    await waitFor(async () => {
      const saved = await getPage("pg1");
      expect(saved?.body).toContain("공유 문서의 최신 본문");
      expect(saved?.title).toBe("공유 제목");
    });

    view.unmount();
    document.destroy();
  });

  it("공동 편집 중인 초안은 다른 편집자가 공유 문서에 쓴 내용이 있으면 닫아도 지우지 않는다", async () => {
    const user = userEvent.setup();
    const draft = await createPage({ spaceId: "sp1", title: "제목 없음", status: "draft" });
    const document = new Y.Doc();
    Y.applyUpdate(document, createCollaborationBootstrapState("제목 없음", "다른 편집자가 쓴 문단"));
    collaborationMock.useCollaborationSession.mockReturnValue({
      status: "synced",
      participants: [],
      error: null,
      binding: reconnectingBinding(document),
      basePageVersion: null,
      generation: 1,
      localCopy: null,
      retry: vi.fn(),
      restart: vi.fn(),
    });

    const view = renderApp(`/spaces/sp1/pages/${draft.id}/edit`);
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "닫기" }));

    await waitFor(() => expect(screen.queryByRole("textbox", { name: "페이지 제목" })).not.toBeInTheDocument());
    expect(await getPage(draft.id)).not.toBeNull();

    view.unmount();
    document.destroy();
  });
});
