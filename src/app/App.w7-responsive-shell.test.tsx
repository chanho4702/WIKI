import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
// 라우트 청크의 첫 로딩 시간 대신 탐색 전환·포커스 동작을 검증한다(testUtils의 에디터와 같은 방식).
import "../features/wiki/pages/PageViewPage";

function mockCompactViewport() {
  const listeners = new Set<() => void>();
  const media = {
    matches: true,
    media: "(max-width: 700px)",
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", (query: string) =>
    query === media.media ? media : { ...media, matches: false },
  );
  return (compact: boolean) => {
    act(() => {
      media.matches = compact;
      listeners.forEach((listener) => listener());
    });
  };
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

afterEach(() => vi.unstubAllGlobals());

describe("좁은 화면의 글로벌 탐색", () => {
  it("본문으로 시작하고 모바일 토글 후에도 데스크톱의 펼침·너비 설정을 유지한다", async () => {
    const resize = mockCompactViewport();
    localStorage.setItem("wiki.ui.sidebar.width", "340");
    const user = userEvent.setup();
    renderApp("/spaces/sp1");

    await screen.findByRole("heading", { name: "개발 위키", level: 1 });
    const toggle = screen.getByRole("button", { name: "사이드바 토글" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

    await user.click(toggle);
    await screen.findByRole("navigation", { name: "페이지 트리" });
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByRole("main")).toBeVisible();
    expect(toggle).toHaveFocus();
    expect(localStorage.getItem("wiki.ui.sidebar.collapsed")).toBeNull();
    expect(localStorage.getItem("wiki.ui.sidebar.width")).toBe("340");

    resize(false);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("complementary")).toHaveStyle({ width: "340px" });
  });

  it("탐색에서 문서를 열면 본문으로 전환하고 포커스를 이동한다", async () => {
    mockCompactViewport();
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("heading", { name: "개발 위키", level: 1 });

    const toggle = screen.getByRole("button", { name: "사이드바 토글" });
    await user.click(toggle);
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(within(tree).getByRole("link", { name: "시작하기" }));

    await screen.findByRole("heading", { name: "시작하기", level: 1 });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });

  it("데스크톱 접힘을 저장한 경우 모바일에서 펼쳐도 넓은 화면으로 돌아오면 접힘을 유지한다", async () => {
    const resize = mockCompactViewport();
    localStorage.setItem("wiki.ui.sidebar.collapsed", "1");
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("heading", { name: "개발 위키", level: 1 });

    const toggle = screen.getByRole("button", { name: "사이드바 토글" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    resize(false);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("main")).toBeVisible();
    expect(localStorage.getItem("wiki.ui.sidebar.collapsed")).toBe("1");
  });

  it("현재 문서를 다시 선택해도 탐색을 닫고 본문으로 돌아온다", async () => {
    mockCompactViewport();
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { name: "시작하기", level: 1 });

    const toggle = screen.getByRole("button", { name: "사이드바 토글" });
    await user.click(toggle);
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(within(tree).getByRole("link", { name: "시작하기" }));

    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
    expect(screen.getByRole("main")).toHaveFocus();
  });
});
