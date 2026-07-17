import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, createPage, getPage } from "../features/wiki/store/wikiStore";
import { editorRegistry } from "../features/wiki/editor/editorTestRegistry";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  // 이전 테스트의 에디터 destroy가 setTimeout(0)으로 지연 발화될 수 있어, 그 사이 이 테스트가
  // "아직 안 지워진 이전 인스턴스"를 자기 것으로 착각하지 않도록 매 테스트 시작 전 명시적으로 비운다.
  editorRegistry.current = null;
});

describe("W5 블록 에디터 — 편집 화면", () => {
  it("편집 진입 시 탭 없이 제목 입력과 에디터가 보인다", async () => {
    renderApp("/spaces/sp1/pages/pg1/edit");
    expect(await screen.findByPlaceholderText("제목 없음")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "미리보기" })).not.toBeInTheDocument();
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
  });

  it("본문 수정 후 저장하면 보기 화면에 반영된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.commands.insertContentAt(
      editorRegistry.current!.state.doc.content.size,
      { type: "paragraph", content: [{ type: "text", text: "새로 추가한 문단" }] },
    );
    await user.click(screen.getByRole("button", { name: "저장" }));
    // 저장 직후 보기 화면으로 전환되며 짧게 한 번 더 리렌더될 수 있어 findByText로 얻은 노드 참조가
    // 그 사이에 stale해질 수 있다 — 매 폴링마다 새로 질의하도록 assertion 전체를 waitFor로 감싼다.
    await waitFor(() => {
      expect(screen.getByText("새로 추가한 문단")).toBeInTheDocument();
    });
  });

  it("제목만 고치고 저장하면 본문 바이트가 그대로다", async () => {
    const user = userEvent.setup();
    const before = (await getPage("pg1"))!.body;
    renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    const titleInput = screen.getByPlaceholderText("제목 없음");
    await user.clear(titleInput);
    await user.type(titleInput, "새 제목");
    await user.click(screen.getByRole("button", { name: "저장" }));
    // findByText는 제목이 h1과 브레드크럼 현재 위치 span 양쪽에 렌더돼 다중 매치로 실패하므로 heading으로 특정
    await screen.findByRole("heading", { level: 1, name: "새 제목" });
    expect((await getPage("pg1"))!.body).toBe(before);
  });

  it("본문 변경 후 취소를 누르면 confirm을 묻고, 거부하면 편집에 머문다", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.commands.insertContent("변경");
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(confirmSpy).toHaveBeenCalledWith("저장하지 않은 변경이 있습니다. 나가시겠습니까?");
    expect(screen.getByTestId("location")).toHaveTextContent("/edit");
    confirmSpy.mockRestore();
  });

  it("변경이 없으면 취소 시 confirm 없이 이동한다", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  // Task 7 최소 통합 확인 — WikiEditor에 슬래시 확장이 실제로 연결됐는지만 확인한다.
  // 항목 실행(run)·필터·키보드 이동 등은 slashMenu.test.ts(유닛)에서 이미 검증했다.
  // (Enter로 블록 전환을 완주시키지 않는 이유: setHeading처럼 블록 태그 자체가 바뀌는 커맨드는
  // jsdom의 미완성 레이아웃/Range 구현 위에서 ProseMirror의 scrollIntoView 계산과 충돌해
  // 테스트 통과와 무관한 unhandled exception을 만든다 — 여기서는 "연결 확인"만이 목적이라 회피한다.)
  it("'/' 입력 시 블록 삽입 메뉴가 뜨고 Escape로 닫힌다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.chain().focus().insertContent("/제목").run();
    const listbox = await screen.findByRole("listbox", { name: "블록 삽입 메뉴" });
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "제목 1" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // 회귀: 리뷰어 Important — [[ 쿼리(공백 허용)는 "/"도 그대로 삼킬 수 있어, 그 안에서
  // slashMenu까지 동시에 활성화되면 팝업 두 개가 겹치고 키보드는 먼저 등록된 링크 쪽이 삼켰다.
  // slashMenu의 allow가 열린 [[ 런 안에서는 활성화를 거부해야 한다.
  it("[[ 쿼리 안의 '/'는 슬래시 메뉴를 띄우지 않는다 — 링크 팝업만 유지", async () => {
    await createPage({ spaceId: "sp1", parentId: null, title: "운영 / 배포", body: "" });
    renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.chain().focus().insertContent("[[운영 /").run();
    await screen.findByRole("listbox", { name: "페이지 링크 자동완성" });
    expect(screen.queryByRole("listbox", { name: "블록 삽입 메뉴" })).not.toBeInTheDocument();
  });

  it("[[ 밖의 일반 텍스트에서는 '/'가 슬래시 메뉴를 정상적으로 띄운다", async () => {
    renderApp("/spaces/sp1/pages/pg1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.chain().focus().insertContent("일반 텍스트 /제목").run();
    await screen.findByRole("listbox", { name: "블록 삽입 메뉴" });
    expect(screen.queryByRole("listbox", { name: "페이지 링크 자동완성" })).not.toBeInTheDocument();
  });
});
