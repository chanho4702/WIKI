import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

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
});
