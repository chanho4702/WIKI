import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as Y from "yjs";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
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
});
