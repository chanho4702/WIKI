import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { editorRegistry } from "../features/wiki/editor/editorTestRegistry";
// node:fs 대신 Vite의 ?raw 쿼리로 CSS 소스를 문자열로 가져온다 — @types/node 의존 없이
// tsconfig의 기존 "vite/client" 타입만으로 typecheck를 통과한다.
import css from "./app.css?raw";

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

    // 보기 헤더의 너비 토글은 아이콘 버튼(접근 이름은 aria-label "전체 너비"로 고정) — 상태는 aria-pressed로 확인
    const toggle = screen.getByRole("button", { name: "전체 너비" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(article).toHaveClass("page-view--full");
    expect(toggle).toHaveAttribute("aria-pressed", "true");

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

// Task 20: 편집 화면 기본 폭이 보기 화면과 같은 720px인지 — jsdom은 레이아웃 엔진이 없고
// app.css는 테스트 렌더 트리에서 import되지 않으므로(main.tsx 전용) getComputedStyle로는
// 검증할 수 없다. CSS 소스 텍스트(?raw import)를 직접 대조한다.
describe("Task 20 편집↔보기 폭 일치 (CSS 회귀)", () => {
  /** 선택자 이름 뒤에 다른 문자(예: --full의 "--")가 바로 붙지 않는 정확한 규칙 블록만 찾는다 */
  function findRule(selector: string): string {
    const re = new RegExp(
      `(?:^|\\n)${selector.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    );
    const match = re.exec(css);
    if (!match) throw new Error(`CSS 규칙을 찾지 못했습니다: ${selector}`);
    return match[1];
  }

  it(".page-edit 기본 폭이 .page-view와 동일한 760px 중앙 정렬이다", () => {
    const pageView = findRule(".page-view");
    const pageEdit = findRule(".page-edit");
    expect(pageView).toContain("max-width: 760px");
    expect(pageView).toContain("margin: 0 auto");
    expect(pageEdit).toContain("max-width: 760px");
    expect(pageEdit).toContain("margin: 0 auto");
    expect(pageEdit).not.toContain("880px");
  });

  it(".page-edit--full은 .page-view--full과 동일하게 폭 제약을 해제한다", () => {
    const pageViewFull = findRule(".page-view--full");
    const pageEditFull = findRule(".page-edit--full");
    expect(pageViewFull).toContain("max-width: none");
    expect(pageEditFull).toContain("max-width: none");
    expect(pageEditFull).toContain("margin: 0");
  });
});
