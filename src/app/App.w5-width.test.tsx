import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

describe("Task 18 페이지 너비 토글", () => {
  it("보기에서 토글하면 클래스가 반영되고, 편집 화면이 같은 설정을 공유하며, 리마운트 후에도 유지된다", async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp("/spaces/sp1/pages/pg1");
    const heading = await screen.findByRole("heading", { level: 1, name: "시작하기" });
    const article = heading.closest("article.page-view");
    expect(article).not.toBeNull();
    expect(article).not.toHaveClass("page-view--full");

    const toggle = screen.getByRole("button", { name: "전체 너비" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveTextContent("전체 너비");

    await user.click(toggle);

    expect(article).toHaveClass("page-view--full");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveTextContent("기본 너비");

    // 편집 화면으로 이동 — 같은 pageId의 너비 설정을 공유해야 한다
    await user.click(screen.getByRole("button", { name: "편집" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg1/edit");
    });
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    const editRoot = document.querySelector(".page-edit");
    expect(editRoot).toHaveClass("page-edit--full");
    const editToggle = screen.getByRole("button", { name: "전체 너비" });
    expect(editToggle).toHaveAttribute("aria-pressed", "true");
    expect(editToggle).toHaveTextContent("기본 너비");

    unmount();

    // 리마운트(= 새로고침 시뮬레이션) 후에도 localStorage 설정이 유지된다
    renderApp("/spaces/sp1/pages/pg1");
    const heading2 = await screen.findByRole("heading", { level: 1, name: "시작하기" });
    const article2 = heading2.closest("article.page-view");
    expect(article2).toHaveClass("page-view--full");
    expect(screen.getByRole("button", { name: "전체 너비" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("생성 화면(pageId 없음)에는 너비 토글이 없다", async () => {
    renderApp("/spaces/sp1/pages/new");
    await screen.findByPlaceholderText("제목 없음");
    expect(screen.queryByRole("button", { name: "전체 너비" })).not.toBeInTheDocument();
  });

  it("페이지마다 독립적인 설정을 가진다 — pg1을 전체 너비로 바꿔도 pg2는 기본 폭이다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "전체 너비" }));
    expect(screen.getByRole("button", { name: "전체 너비" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    await user.click(within(tree).getByRole("link", { name: "팀 규칙" }));
    const heading2 = await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    expect(screen.getByRole("button", { name: "전체 너비" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(heading2.closest("article.page-view")).not.toHaveClass("page-view--full");
  });
});
