import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/**
 * 사이드바 제목 검색.
 *
 * 2026-08-29부터 검색은 **서버가** 하고 결과는 평면 목록이다. 예전에는 화면이 들고 있던
 * 스페이스 전 페이지를 걸러 계층(매치 + 조상)을 유지했지만, 지연 트리에서는 그 목록 자체가
 * 없다. 매치마다 조상 체인을 따로 받아오면 한 번 타이핑에 요청이 수십 개가 된다.
 */
describe("W3 사이드바 검색", () => {
  it("'설정' 입력 시 매치만 평면 목록으로 보이고, 비우면 트리로 돌아간다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    await user.type(screen.getByLabelText("페이지 검색"), "설정");
    const results = await screen.findByRole("navigation", { name: "페이지 검색 결과" });
    expect(within(results).getByRole("link", { name: "개발 환경 설정" })).toBeInTheDocument();
    expect(within(results).getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
    // 비매치는 나오지 않는다 — 조상이라는 이유로 끼워 넣지도 않는다
    expect(within(results).queryByRole("link", { name: "시작하기" })).not.toBeInTheDocument();
    expect(within(results).queryByRole("link", { name: "팀 규칙" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "페이지 트리" })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("페이지 검색"));
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    expect(within(tree).getByRole("link", { name: "팀 규칙" })).toBeInTheDocument();
  });

  it("검색 결과에서 문서를 열 수 있다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    await user.type(screen.getByLabelText("페이지 검색"), "로컬");
    const results = await screen.findByRole("navigation", { name: "페이지 검색 결과" });
    await user.click(within(results).getByRole("link", { name: "로컬 DB 설정" }));

    expect(await screen.findByRole("heading", { level: 1, name: "로컬 DB 설정" })).toBeInTheDocument();
  });

  it("매치가 없으면 '검색 결과 없음'을 보여준다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    await user.type(screen.getByLabelText("페이지 검색"), "존재하지않는제목");

    expect(await screen.findByText("검색 결과 없음")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "페이지 트리" })).not.toBeInTheDocument();
  });
});
