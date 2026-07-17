import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { editorRegistry } from "../features/wiki/editor/editorTestRegistry";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  // 이전 테스트의 에디터 destroy가 setTimeout(0)으로 지연 발화될 수 있어, 그 사이 이 테스트가
  // "아직 안 지워진 이전 인스턴스"를 자기 것으로 착각하지 않도록 매 테스트 시작 전 명시적으로 비운다.
  editorRegistry.current = null;
});

describe("W6 편집 크롬 — 상단 고정 업데이트/닫기 바", () => {
  it("최상단 액션 바에 전체 너비·업데이트·닫기 버튼이 있다", async () => {
    renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    const chrome = document.querySelector(".edit-chrome");
    expect(chrome).not.toBeNull();
    expect(screen.getByRole("button", { name: "전체 너비" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "업데이트" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "닫기" })).toBeInTheDocument();
    // 하단 액션 행은 제거됐다
    expect(document.querySelector(".page-edit-actions")).not.toBeInTheDocument();
  });

  it("업데이트를 누르면 저장되어 보기로 이동하고 성공 토스트가 뜬다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    const titleField = screen.getByPlaceholderText("제목 없음");
    await user.clear(titleField);
    await user.type(titleField, "팀 규칙 v2");
    await user.click(screen.getByRole("button", { name: "업데이트" }));
    expect(await screen.findByText("페이지를 저장했습니다")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/spaces\/sp1\/pages\/pg2$/);
    });
    expect(await screen.findByRole("heading", { level: 1, name: "팀 규칙 v2" })).toBeInTheDocument();
  });

  it("닫기는 dirty 상태면 confirm을 묻고, 거부하면 편집에 머문다", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    const titleField = screen.getByPlaceholderText("제목 없음");
    await user.type(titleField, " 추가");
    await user.click(screen.getByRole("button", { name: "닫기" }));
    expect(confirmSpy).toHaveBeenCalledWith("저장하지 않은 변경이 있습니다. 나가시겠습니까?");
    expect(screen.getByTestId("location")).toHaveTextContent("/edit");
    confirmSpy.mockRestore();
  });

  it("닫기는 confirm에 동의하면 보기로 이동한다", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    const titleField = screen.getByPlaceholderText("제목 없음");
    await user.type(titleField, " 추가");
    await user.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/spaces\/sp1\/pages\/pg1$/);
    });
    confirmSpy.mockRestore();
  });

  it("제목을 입력하면 상단 미리보기가 동기화되고, 비어 있으면 '제목 없음'을 보인다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    const chrome = document.querySelector(".edit-chrome")!;
    // pg1의 기존 제목("시작하기")이 로드된 뒤 미리보기에 반영된다
    await waitFor(() => {
      expect(chrome.querySelector(".edit-chrome-title")).toHaveTextContent("시작하기");
    });
    const titleField = screen.getByPlaceholderText("제목 없음");
    await user.clear(titleField);
    expect(chrome.querySelector(".edit-chrome-title")).toHaveTextContent("제목 없음");
    await user.type(titleField, "새 제목입니다");
    expect(chrome.querySelector(".edit-chrome-title")).toHaveTextContent("새 제목입니다");
  });
});
