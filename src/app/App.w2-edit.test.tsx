import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, getPage, updatePage } from "../features/wiki/store/wikiStore";
import { MOCK_USERS } from "../mock/users";
import { editorRegistry } from "../features/wiki/editor/editorTestRegistry";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  // 이전 테스트의 에디터 destroy가 setTimeout(0)으로 지연 발화될 수 있어, 그 사이 이 테스트가
  // "아직 안 지워진 이전 인스턴스"를 자기 것으로 착각하지 않도록 매 테스트 시작 전 명시적으로 비운다.
  editorRegistry.current = null;
});

describe("W2 페이지 편집·생성", () => {
  it("편집에서 저장하면 보기로 돌아가 렌더가 반영되고 사이드바 트리 제목도 갱신된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    await user.click(screen.getByRole("button", { name: "편집" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg2/edit");
    });
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    // 기존 내용이 채워져 있다
    const titleField = screen.getByPlaceholderText("제목 없음");
    expect(titleField).toHaveValue("팀 규칙");
    await user.clear(titleField);
    await user.type(titleField, "팀 규칙 v2");
    // setContent의 emitUpdate 기본값은 false(update 이벤트 미발생) — WikiEditor의 dirty 판정이
    // onUpdate에 의존하므로 테스트에서 프로그램적으로 내용을 바꿀 때는 명시적으로 true를 준다.
    editorRegistry.current!.commands.setContent("## 새 규칙", true);
    await user.click(screen.getByRole("button", { name: "업데이트" }));
    // 보기로 복귀 + 마크다운 렌더 반영
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/spaces\/sp1\/pages\/pg2$/);
    });
    expect(await screen.findByRole("heading", { level: 1, name: "팀 규칙 v2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "새 규칙" })).toBeInTheDocument();
    // reloadPages 검증 — 트리에도 새 제목
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(tree).getByRole("link", { name: "팀 규칙 v2" })).toBeInTheDocument();
  });

  it("수정 화면에서 취소하면 보기로 돌아가고 내용은 바뀌지 않는다", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp("/spaces/sp1/pages/pg2/edit");
    const titleField = await screen.findByPlaceholderText("제목 없음");
    await user.clear(titleField);
    await user.type(titleField, "버려질 제목");
    await user.click(screen.getByRole("button", { name: "닫기" }));
    // Task 5: 제목 변경 후 취소는 confirm을 거치고 동의하면 이동
    expect(confirmSpy).toHaveBeenCalledWith("저장하지 않은 변경이 있습니다. 나가시겠습니까?");
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/spaces\/sp1\/pages\/pg2$/);
    });
    expect(await screen.findByRole("heading", { level: 1, name: "팀 규칙" })).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("다른 세션이 먼저 저장하면 로컬 편집을 보존하고 비교 후 명시적 병합만 허용한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2/edit");
    const titleField = await screen.findByRole("textbox", { name: "페이지 제목" });
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());

    // 편집 화면은 v1을 잡은 상태. 다른 브라우저 역할의 호출이 먼저 v2를 저장한다.
    const serverSaved = await updatePage("pg2", {
      title: "서버에서 먼저 바뀐 제목",
      body: "## 서버에서 먼저 저장한 본문",
    });
    expect(serverSaved.version).toBeGreaterThan(1);

    await user.clear(titleField);
    await user.type(titleField, "내 로컬 편집 제목");
    editorRegistry.current!.commands.setContent("## 내 로컬 편집 본문", true);
    await user.click(screen.getByRole("button", { name: "업데이트" }));

    const conflict = await screen.findByRole("alert");
    expect(within(conflict).getByText("다른 사용자의 변경사항이 먼저 저장됐습니다")).toBeInTheDocument();
    expect(within(conflict).getByText("서버에서 먼저 바뀐 제목")).toBeInTheDocument();
    expect(within(conflict).getByText("내 로컬 편집 제목")).toBeInTheDocument();
    expect(titleField).toHaveValue("내 로컬 편집 제목");
    expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg2/edit");
    expect(await getPage("pg2")).toMatchObject({ title: "서버에서 먼저 바뀐 제목" });

    // 사용자가 비교를 마치고 최신 서버 버전을 병합 기준으로 명시한 뒤에만 재저장할 수 있다.
    await user.click(within(conflict).getByRole("button", { name: /기준으로 병합 계속/ }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "업데이트" }));
    expect(await screen.findByRole("heading", { level: 1, name: "내 로컬 편집 제목" })).toBeInTheDocument();
  });

  it("저장 충돌에서 서버본 재로드를 확인하면 로컬 편집 대신 최신 본문으로 에디터를 다시 만든다", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp("/spaces/sp1/pages/pg2/edit");
    const titleField = await screen.findByRole("textbox", { name: "페이지 제목" });
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());

    await updatePage("pg2", { title: "최신 서버 제목", body: "## 최신 서버 본문" });
    await user.clear(titleField);
    await user.type(titleField, "버릴 로컬 제목");
    editorRegistry.current!.commands.setContent("## 버릴 로컬 본문", true);
    await user.click(screen.getByRole("button", { name: "업데이트" }));

    const conflict = await screen.findByRole("alert");
    await user.click(within(conflict).getByRole("button", { name: "서버본으로 다시 불러오기" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "내 편집 내용을 버리고 서버에 저장된 최신 내용으로 다시 불러오시겠습니까?",
    );
    await waitFor(() => expect(titleField).toHaveValue("최신 서버 제목"));
    await waitFor(() => expect(editorRegistry.current?.getText()).toContain("최신 서버 본문"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("저장됨")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("생성 URL(new?parent=pg1)에서 저장하면 새 페이지로 이동하고 트리의 pg1 하위에 나타난다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new?parent=pg1");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    await user.type(screen.getByPlaceholderText("제목 없음"), "새 하위 문서");
    editorRegistry.current!.commands.setContent("# 하위 문서 본문", true);
    await user.click(screen.getByRole("button", { name: "업데이트" }));
    // 새 페이지 보기로 이동 + 렌더
    expect(
      await screen.findByRole("heading", { level: 1, name: "새 하위 문서" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "하위 문서 본문" })).toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toMatch(
      /^\/spaces\/sp1\/pages\/(?!new$)[^/]+$/,
    );
    // 트리 반영 (reloadPages) — 그리고 pg1을 접으면 사라진다 = parentId가 pg1이라는 구조 검증
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(tree).getByRole("link", { name: "새 하위 문서" })).toBeInTheDocument();
    await user.click(within(tree).getByRole("button", { name: "시작하기 하위 접기" }));
    expect(within(tree).queryByRole("link", { name: "새 하위 문서" })).not.toBeInTheDocument();
  });

  it("헤더 '만들기 → 페이지'는 초안을 만들어 트리에 세우고 그 편집 화면을 연다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "만들기" }));
    // 만들기 메뉴는 폴더 도입 후 "페이지 / 폴더 / 새 스페이스" 구성이다
    await user.click(await screen.findByRole("menuitem", { name: "페이지" }));

    // 예전엔 /pages/new(아직 없는 문서)로 이동만 해서 트리에 아무것도 안 나타났다 —
    // 뭘 만들고 있는지 확인할 방법이 없었다. 이제 실제 문서(초안)로 만들어 편집 화면을 연다.
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(
        /^\/spaces\/sp1\/pages\/[^/]+\/edit$/,
      );
    });
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(tree).getByRole("link", { name: "제목 없음 초안" })).toBeInTheDocument();
  });

  it("손대지 않은 초안을 닫으면 트리에서 사라진다 — '제목 없음'이 쌓이지 않는다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "만들기" }));
    await user.click(await screen.findByRole("menuitem", { name: "페이지" }));
    await screen.findByRole("button", { name: "게시" });

    await user.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1");
    });
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(tree).queryByRole("link", { name: /제목 없음/ })).not.toBeInTheDocument();
  });

  it("트리 항목의 '하위 콘텐츠 추가'는 그 항목의 하위 초안을 만든다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(within(tree).getByRole("button", { name: "팀 규칙 하위 콘텐츠 추가" }));
    // 하위로 폴더도 만들 수 있게 드롭다운이 됐다 — 페이지를 고른다
    await user.click(await screen.findByRole("menuitem", { name: "페이지" }));
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(/\/edit$/);
    });
    // 실제로 pg2(팀 규칙)의 하위인지 — 제목을 채워 게시한 뒤 pg2를 접으면 사라져야 한다
    const title = screen.getByRole("textbox", { name: "페이지 제목" });
    await user.clear(title);
    await user.type(title, "회의록 규칙");
    await user.click(screen.getByRole("button", { name: "게시" }));
    await screen.findByRole("heading", { level: 1, name: "회의록 규칙" });
    await user.click(within(tree).getByRole("button", { name: "팀 규칙 하위 접기" }));
    expect(within(tree).queryByRole("link", { name: "회의록 규칙" })).not.toBeInTheDocument();
  });

  it("페이지 0개 스페이스의 '첫 페이지 만들기'로 루트 페이지를 만든다", async () => {
    localStorage.setItem(
      "wiki.v1",
      JSON.stringify({
        users: MOCK_USERS,
        spaces: [{ id: "sp9", key: "NEW", name: "새 위키", createdAt: "2026-07-01T00:00:00.000Z" }],
        pages: [],
        versions: [],
        comments: [],
      }),
    );
    const user = userEvent.setup();
    renderApp("/spaces/sp9");
    await user.click(await screen.findByRole("button", { name: "첫 페이지 만들기" }));
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(/^\/spaces\/sp9\/pages\/[^/]+\/edit$/);
    });
    // 편집 화면은 본문을 비동기로 불러오므로(그 전엔 로딩 표시) findBy로 기다린다
    const newTitle = await screen.findByRole("textbox", { name: "페이지 제목" });
    await user.clear(newTitle);
    await user.type(newTitle, "홈");
    await user.click(screen.getByRole("button", { name: "게시" })); // 본문 없이 게시 가능 (body="")
    expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(tree).getByRole("link", { name: "홈" })).toBeInTheDocument();
  });
});
