import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("Task 19 사이드바 접기/펼치기", () => {
  it("기본 상태는 펼침 — 검색·트리·새 페이지가 보이고 열기 버튼은 없다", async () => {
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });
    expect(screen.getByLabelText("페이지 검색")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새 페이지" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사이드바 접기" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.queryByRole("button", { name: "사이드바 열기" })).not.toBeInTheDocument();
  });

  it("접기 버튼을 누르면 트리·검색이 사라지고 열기 버튼이 나타난다, 다시 열면 복원된다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "사이드바 접기" }));

    expect(screen.queryByRole("navigation", { name: "페이지 트리" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("페이지 검색")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새 페이지" })).not.toBeInTheDocument();
    const opener = screen.getByRole("button", { name: "사이드바 열기" });
    expect(opener).toBeInTheDocument();

    await user.click(opener);

    await screen.findByRole("navigation", { name: "페이지 트리" });
    expect(screen.getByLabelText("페이지 검색")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeInTheDocument();
  });

  it("접은 상태로 새로고침(리마운트)해도 localStorage에 의해 접힘이 유지된다", async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(screen.getByRole("button", { name: "사이드바 접기" }));
    expect(screen.getByRole("button", { name: "사이드바 열기" })).toBeInTheDocument();
    unmount();

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "사이드바 열기" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("navigation", { name: "페이지 트리" })).not.toBeInTheDocument();
  });
});

describe("Task 19 사이드바 토글 포커스 관리", () => {
  it("초기 마운트 시에는 사이드바 버튼으로 포커스를 옮기지 않는다(스틸 방지)", async () => {
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });
    const closeButton = screen.getByRole("button", { name: "사이드바 접기" });
    expect(document.activeElement).not.toBe(closeButton);
  });

  it("접기 버튼을 클릭하면 포커스가 열기 버튼으로 이동한다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "사이드바 접기" }));

    const opener = screen.getByRole("button", { name: "사이드바 열기" });
    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(opener);
  });

  it("열기 버튼을 클릭하면 포커스가 접기 버튼으로 이동한다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(screen.getByRole("button", { name: "사이드바 접기" }));
    const opener = screen.getByRole("button", { name: "사이드바 열기" });

    await user.click(opener);

    const closeButton = screen.getByRole("button", { name: "사이드바 접기" });
    expect(document.activeElement).toBe(closeButton);
  });
});

describe("Task 19 사이드바 너비 조절(리사이저)", () => {
  it("리사이저에 포커스 후 → 키를 누르면 aside 폭이 16px 늘어난다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    const resizer = screen.getByRole("separator", { name: "사이드바 너비 조절" });
    const aside = document.querySelector(".wiki-sidebar") as HTMLElement;
    expect(aside.style.width).toBe("288px"); // 기본값

    resizer.focus();
    await user.keyboard("{ArrowRight}");

    expect(aside.style.width).toBe("304px");
    expect(resizer).toHaveAttribute("aria-valuenow", "304");
  });

  it("← 키를 누르면 aside 폭이 16px 줄어들고, 최솟값(200px) 아래로는 내려가지 않는다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    const resizer = screen.getByRole("separator", { name: "사이드바 너비 조절" });
    const aside = document.querySelector(".wiki-sidebar") as HTMLElement;

    resizer.focus();
    await user.keyboard("{ArrowLeft}");
    expect(aside.style.width).toBe("272px");

    // 최솟값까지 여러 번 눌러도 200px 밑으로는 내려가지 않는다
    for (let i = 0; i < 10; i += 1) {
      await user.keyboard("{ArrowLeft}");
    }
    expect(aside.style.width).toBe("200px");
  });

  it("키보드로 조절한 폭은 localStorage에 저장되어 리마운트 후에도 유지된다", async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    const resizer = screen.getByRole("separator", { name: "사이드바 너비 조절" });
    resizer.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");

    expect(localStorage.getItem("wiki.ui.sidebar.width")).toBe("320");
    unmount();

    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });
    const aside = document.querySelector(".wiki-sidebar") as HTMLElement;
    expect(aside.style.width).toBe("320px");
  });
});
