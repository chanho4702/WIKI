import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W3 사이드바 검색", () => {
  it("'설정' 입력 시 매치(pg3·pg5)와 조상(pg1)만 남고, 비우면 전체가 돌아온다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.type(screen.getByLabelText("페이지 검색"), "설정");
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    // 매치 + 조상 체인 유지 (계층 구조 보존)
    expect(within(tree).getByRole("link", { name: "개발 환경 설정" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "시작하기" })).toBeInTheDocument();
    // 비매치는 숨김
    expect(within(tree).queryByRole("link", { name: "팀 규칙" })).not.toBeInTheDocument();
    expect(within(tree).queryByRole("link", { name: "배포 가이드" })).not.toBeInTheDocument();
    // 비우면 원상복귀
    await user.clear(screen.getByLabelText("페이지 검색"));
    const restored = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(restored).getByRole("link", { name: "팀 규칙" })).toBeInTheDocument();
    expect(within(restored).getByRole("link", { name: "배포 가이드" })).toBeInTheDocument();
    expect(within(restored).getAllByRole("link")).toHaveLength(5);
  });

  it("접힌 노드도 검색 중에는 펼쳐 보이고, 검색을 비우면 접힘 상태로 돌아간다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    // pg1을 접는다 → 하위 pg3 숨김
    await user.click(screen.getByRole("button", { name: "시작하기 하위 접기" }));
    const collapsed = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(collapsed).queryByRole("link", { name: "개발 환경 설정" })).not.toBeInTheDocument();
    // 검색 중엔 접기 무시 — 전부 펼침, 접기 토글도 없다
    await user.type(screen.getByLabelText("페이지 검색"), "설정");
    const searching = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(searching).getByRole("link", { name: "개발 환경 설정" })).toBeInTheDocument();
    expect(within(searching).getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
    expect(
      within(searching).queryByRole("button", { name: /하위 (접기|펼치기)/ }),
    ).not.toBeInTheDocument();
    // 비우면 접힘 상태 복귀
    await user.clear(screen.getByLabelText("페이지 검색"));
    const restored = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(restored).queryByRole("link", { name: "개발 환경 설정" })).not.toBeInTheDocument();
    expect(within(restored).getByRole("button", { name: "시작하기 하위 펼치기" })).toBeInTheDocument();
  });

  it("매치가 없으면 '검색 결과 없음'을 보여준다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.type(screen.getByLabelText("페이지 검색"), "존재하지않는제목");
    expect(screen.getByText("검색 결과 없음")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "페이지 트리" })).not.toBeInTheDocument();
  });
});
