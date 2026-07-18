import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

/** 시드(sp1 하나)에 두 번째 스페이스(sp2)를 더해 localStorage에 직접 심는다(App.w6-spaces.test.tsx와
 * 동일한 패턴) — 별표 섹션은 최소 2개 스페이스가 있어야 의미 있게 검증할 수 있다. */
function seedTwoSpaces() {
  const data = createSeedData();
  data.spaces.push({ id: "sp2", key: "OPS", name: "운영 위키", createdAt: "2026-07-11T00:00:00.000Z" });
  data.pages.push({
    id: "pg9",
    spaceId: "sp2",
    parentId: null,
    title: "운영 시작하기",
    body: "# 운영 위키",
    position: 1,
    createdBy: "u1",
    updatedBy: "u1",
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
  });
  localStorage.setItem("wiki.v1", JSON.stringify(data));
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("Task 19/W7-T6 사이드바 접기/펼치기 — 헤더 토글", () => {
  it("기본 상태는 펼침 — 검색·트리·새 페이지가 보이고 토글 버튼은 aria-expanded=true다", async () => {
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });
    expect(screen.getByLabelText("페이지 검색")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새 페이지" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사이드바 토글" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("토글 버튼을 누르면 사이드바(aside)가 완전히 사라진다(트리·검색·새 페이지 미렌더), 다시 누르면 복원된다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    const toggle = screen.getByRole("button", { name: "사이드바 토글" });
    await user.click(toggle);

    expect(document.querySelector(".wiki-sidebar")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "페이지 트리" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("페이지 검색")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새 페이지" })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    await screen.findByRole("navigation", { name: "페이지 트리" });
    expect(screen.getByLabelText("페이지 검색")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("접은 상태로 새로고침(리마운트)해도 localStorage에 의해 접힘이 유지된다", async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(screen.getByRole("button", { name: "사이드바 토글" }));
    expect(document.querySelector(".wiki-sidebar")).not.toBeInTheDocument();
    unmount();

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "사이드바 토글" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });
    expect(screen.queryByRole("navigation", { name: "페이지 트리" })).not.toBeInTheDocument();
  });
});

describe("W7-T6 사이드바 토글 포커스 관리", () => {
  // 토글 버튼이 TopBar에 상시 존재하므로(사이드바 접힘 여부와 무관하게 unmount되지 않음) 클릭해도
  // 포커스가 그대로 토글 버튼에 남는다 — W6까지 있던 close↔open 버튼 간 포커스 이동 로직은 더 이상
  // 필요 없다(버튼 자체가 사라지지 않으므로).
  it("토글 버튼을 클릭해 접어도 포커스는 토글 버튼에 그대로 남는다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    const toggle = screen.getByRole("button", { name: "사이드바 토글" });
    await user.click(toggle);

    expect(document.activeElement).toBe(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("다시 클릭해 펼쳐도 포커스는 토글 버튼에 그대로 남는다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    const toggle = screen.getByRole("button", { name: "사이드바 토글" });
    await user.click(toggle);
    await user.click(toggle);

    expect(document.activeElement).toBe(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
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

describe("W7-T6 사이드바 별표 스페이스 섹션", () => {
  it("별표된 스페이스가 없으면 섹션이 렌더되지 않고, '모든 스페이스 보기' 링크는 항상 보인다", async () => {
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    expect(screen.queryByText("별표 표시된 스페이스")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "모든 스페이스 보기" });
    expect(link).toHaveAttribute("href", "/spaces");
  });

  it("별표된 다른 스페이스가 있으면 목록에 나타나고, 클릭하면 그 스페이스로 이동한다", async () => {
    seedTwoSpaces();
    localStorage.setItem("wiki.ui.starredSpaces", JSON.stringify(["sp2"]));
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    const section = screen.getByRole("region", { name: "별표 표시된 스페이스" });
    const item = within(section).getByRole("button", { name: "운영 위키 (OPS)" });

    await user.click(item);

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp2");
    });
  });

  it("현재 스페이스는 별표되어 있어도 별표 섹션에 나타나지 않는다", async () => {
    seedTwoSpaces();
    localStorage.setItem("wiki.ui.starredSpaces", JSON.stringify(["sp1"]));
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    // sp1(개발 위키)이 현재 스페이스 — 별표되어 있어도 섹션 자체가 뜨지 않는다(sp2는 별표 안 됨).
    expect(screen.queryByText("별표 표시된 스페이스")).not.toBeInTheDocument();
  });
});
