import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, updatePage } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/**
 * 버전 diff — W4에서 모달 안 "변경사항" 탭으로 만들었고, W30에서 비교 전용 화면으로 옮겼다.
 * 비교 대상이 주소에 있어야 공유·북마크가 성립한다.
 *
 * 옛 버전 하나만 골랐을 때의 "전체 added"(기준이 없던 상태)는 새 UI에 대응하는 상태가 없다 —
 * 그 규칙 자체는 `lib/lineDiff.test.ts`의 "빈 문자열 → 내용은 전부 added"가 고정한다.
 */
describe("W4 버전 diff", () => {
  it("표에서 두 버전을 골라 비교하면 직전 버전과의 라인 diff를 보여준다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1/history"); // pg1은 v1/v2 두 버전
    await screen.findByRole("heading", { level: 1, name: "페이지 히스토리" });

    await user.click(screen.getByRole("checkbox", { name: "v. 1 선택" }));
    await user.click(screen.getByRole("checkbox", { name: "v. 2 선택" }));
    await user.click(screen.getByRole("button", { name: "선택한 버전 비교" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/spaces/sp1/pages/pg1/history/compare?from=1&to=2",
      );
    });
    const diff = await screen.findByTestId("diff-view");
    // v1에만 있던 라인은 removed, v2에 새로 들어온 라인은 added
    expect(within(diff).getByText("초기 안내 문서입니다.")).toHaveClass("diff-removed");
    expect(within(diff).getByText("## 시작 순서")).toHaveClass("diff-added");
  });

  it("주소의 from이 to보다 커도 옛것 → 새것 방향으로 비교한다", async () => {
    renderApp("/spaces/sp1/pages/pg1/history/compare?from=2&to=1");

    expect(
      await screen.findByRole("heading", { level: 1, name: "v. 1 ↔ v. 2 비교" }),
    ).toBeInTheDocument();
    const diff = await screen.findByTestId("diff-view");
    expect(within(diff).getByText("초기 안내 문서입니다.")).toHaveClass("diff-removed");
    expect(within(diff).getByText("## 시작 순서")).toHaveClass("diff-added");
  });

  it("제목이 바뀐 버전은 제목 변경 한 줄을 표시한다", async () => {
    await updatePage("pg2", { title: "팀 규칙 개정판" });
    renderApp("/spaces/sp1/pages/pg2/history/compare?from=1&to=2");

    expect(await screen.findByText("제목: 팀 규칙 → 팀 규칙 개정판")).toBeInTheDocument();
  });

  it("주소에 없는 버전을 비교하려 하면 빈 diff가 아니라 에러 상태를 보여준다", async () => {
    renderApp("/spaces/sp1/pages/pg1/history/compare?from=1");

    expect(await screen.findByText("비교할 두 버전을 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByTestId("diff-view")).not.toBeInTheDocument();
  });
});
