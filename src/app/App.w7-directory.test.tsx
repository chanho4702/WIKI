import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

/** 시드(sp1 하나)에 두 번째 스페이스(sp2)를 더해 localStorage에 직접 심는다
 * (App.w5-sidebar.test.tsx와 동일한 패턴) — 디렉토리 테이블/카드 그리드는 최소 2개 스페이스가
 * 있어야 필터·별표 반영을 의미 있게 검증할 수 있다. */
function seedTwoSpaces() {
  const data = createSeedData();
  data.spaces.push({ id: "sp2", key: "OPS", name: "운영 위키", createdAt: "2026-07-11T00:00:00.000Z" });
  return data;
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W7-T7 스페이스 디렉토리 페이지(/spaces)", () => {
  it("제목과 모든 스페이스 테이블(행 수)을 렌더한다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(seedTwoSpaces()));
    renderApp("/spaces");

    expect(await screen.findByRole("heading", { name: "스페이스", level: 1 })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "모든 스페이스" });
    // 헤더 행 1 + 데이터 행 2(sp1, sp2)
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByRole("button", { name: "개발 위키 (DEV)" })).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "운영 위키 (OPS)" })).toBeInTheDocument();
  });

  it("별표된 스페이스가 없으면 '자주 찾는 스페이스' 섹션이 렌더되지 않는다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(seedTwoSpaces()));
    renderApp("/spaces");

    await screen.findByRole("heading", { name: "스페이스", level: 1 });
    expect(screen.queryByRole("heading", { name: "자주 찾는 스페이스" })).not.toBeInTheDocument();
  });

  it("별표된 스페이스가 있으면 '자주 찾는 스페이스' 카드에 반영된다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(seedTwoSpaces()));
    localStorage.setItem("wiki.ui.starredSpaces", JSON.stringify(["sp2"]));
    renderApp("/spaces");

    await screen.findByRole("heading", { name: "스페이스", level: 1 });
    const section = screen.getByRole("region", { name: "자주 찾는 스페이스" });
    expect(within(section).getByText("운영 위키")).toBeInTheDocument();
    expect(within(section).getByText("OPS")).toBeInTheDocument();
  });

  it("제목으로 필터링 — 이름·키 부분 일치(대소문자 무시), 결과 0개면 EmptyState", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(seedTwoSpaces()));
    renderApp("/spaces");

    await screen.findByRole("heading", { name: "스페이스", level: 1 });
    const filterInput = screen.getByLabelText("제목으로 필터링");

    await user.type(filterInput, "ops");
    let table = screen.getByRole("table", { name: "모든 스페이스" });
    expect(within(table).getAllByRole("row")).toHaveLength(2); // 헤더 + sp2
    expect(within(table).getByRole("button", { name: "운영 위키 (OPS)" })).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: "개발 위키 (DEV)" })).not.toBeInTheDocument();

    await user.clear(filterInput);
    await user.type(filterInput, "존재하지않음");
    expect(screen.queryByRole("table", { name: "모든 스페이스" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "검색 결과 없음" })).toBeInTheDocument();
  });

  it("테이블 행의 별표 토글 버튼을 누르면 '자주 찾는 스페이스' 섹션이 즉시 갱신된다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(seedTwoSpaces()));
    renderApp("/spaces");

    await screen.findByRole("heading", { name: "스페이스", level: 1 });
    expect(screen.queryByRole("heading", { name: "자주 찾는 스페이스" })).not.toBeInTheDocument();

    const table = screen.getByRole("table", { name: "모든 스페이스" });
    const star = within(table).getByRole("button", { name: "운영 위키 별표" });
    expect(star).toHaveAttribute("aria-pressed", "false");

    await user.click(star);

    expect(star).toHaveAttribute("aria-pressed", "true");
    const section = screen.getByRole("region", { name: "자주 찾는 스페이스" });
    expect(within(section).getByText("운영 위키")).toBeInTheDocument();
  });

  it("테이블 행의 이름을 클릭하면 해당 스페이스로 이동한다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(seedTwoSpaces()));
    renderApp("/spaces");

    await screen.findByRole("heading", { name: "스페이스", level: 1 });
    const table = screen.getByRole("table", { name: "모든 스페이스" });
    await user.click(within(table).getByRole("button", { name: "운영 위키 (OPS)" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp2");
    });
  });

  it("사이드바의 '모든 스페이스 보기' 링크를 클릭하면 /spaces 디렉토리 페이지에 도달한다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("link", { name: "모든 스페이스 보기" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces");
    });
    expect(await screen.findByRole("heading", { name: "스페이스", level: 1 })).toBeInTheDocument();
  });
});
