import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { MOCK_USERS } from "../mock/users";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W2 페이지 편집·생성", () => {
  it("편집에서 저장하면 보기로 돌아가 렌더가 반영되고 사이드바 트리 제목도 갱신된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    await user.click(screen.getByRole("link", { name: "편집" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg2/edit");
    });
    // 기존 내용이 채워져 있다
    const titleField = await screen.findByLabelText("제목");
    expect(titleField).toHaveValue("팀 규칙");
    await user.clear(titleField);
    await user.type(titleField, "팀 규칙 v2");
    const bodyField = screen.getByLabelText("본문");
    await user.clear(bodyField);
    await user.type(bodyField, "## 새 규칙");
    await user.click(screen.getByRole("button", { name: "저장" }));
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

  it("미리보기 탭에서 입력 중인 마크다운이 렌더로 보이고, 작성 탭으로 돌아와도 입력이 유지된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2/edit");
    const bodyField = await screen.findByLabelText("본문");
    await user.clear(bodyField);
    await user.type(bodyField, "# 미리보기 확인");
    await user.click(screen.getByRole("tab", { name: "미리보기" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "미리보기 확인" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "작성" }));
    expect(screen.getByLabelText("본문")).toHaveValue("# 미리보기 확인");
  });

  it("수정 화면에서 취소하면 보기로 돌아가고 내용은 바뀌지 않는다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2/edit");
    const titleField = await screen.findByLabelText("제목");
    await user.clear(titleField);
    await user.type(titleField, "버려질 제목");
    await user.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(/\/spaces\/sp1\/pages\/pg2$/);
    });
    expect(await screen.findByRole("heading", { level: 1, name: "팀 규칙" })).toBeInTheDocument();
  });

  it("생성 URL(new?parent=pg1)에서 저장하면 새 페이지로 이동하고 트리의 pg1 하위에 나타난다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new?parent=pg1");
    await user.type(await screen.findByLabelText("제목"), "새 하위 문서");
    await user.type(screen.getByLabelText("본문"), "# 하위 문서 본문");
    await user.click(screen.getByRole("button", { name: "저장" }));
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

  it("사이드바 '새 페이지'는 루트 생성으로 이동하고, 취소하면 스페이스 인덱스를 거쳐 첫 페이지로 돌아간다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "새 페이지" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/new");
    });
    await user.click(screen.getByRole("button", { name: "취소" }));
    // 루트 생성 취소 → /spaces/sp1 → SpaceIndexPage가 첫 루트 페이지로 이어서 redirect
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg1");
    });
  });

  it("트리 항목의 '하위 페이지 추가' 버튼은 parent 쿼리를 담은 생성 화면으로 이동한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(within(tree).getByRole("button", { name: "팀 규칙 하위 페이지 추가" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/new");
    });
    // parent=pg2가 실제로 적용되는지 — 저장 후 pg2를 접으면 새 항목이 사라진다
    await user.type(screen.getByLabelText("제목"), "회의록 규칙");
    await user.click(screen.getByRole("button", { name: "저장" }));
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
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp9/pages/new");
    });
    await user.type(screen.getByLabelText("제목"), "홈");
    await user.click(screen.getByRole("button", { name: "저장" })); // 본문 없이 저장 가능 (body="")
    expect(await screen.findByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(tree).getByRole("link", { name: "홈" })).toBeInTheDocument();
  });
});
