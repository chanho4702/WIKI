import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { MOCK_USERS } from "../mock/users";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("App 라우팅과 위키 W1 흐름", () => {
  it("스페이스가 0개면 EmptyState를 보여준다", async () => {
    // 시드를 우회해 빈 데이터를 미리 심는다
    localStorage.setItem(
      "wiki.v1",
      JSON.stringify({ users: MOCK_USERS, spaces: [], pages: [], versions: [], comments: [] }),
    );
    renderApp();
    expect(
      await screen.findByRole("heading", { name: "아직 스페이스가 없습니다" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "첫 스페이스 만들기" })).toBeInTheDocument();
  });

  // 페이지 제목은 사이드바 트리와 본문(스페이스 개요의 콘텐츠 트리)에 동시에 나타난다 —
  // 트리 동작을 검증할 땐 반드시 nav로 스코프를 좁힌다(전역 쿼리는 다중 매치로 실패).
  const treeIn = () => within(screen.getByRole("navigation", { name: "페이지 트리" }));

  it("루트 접근 시 첫 스페이스의 개요로 가고, 트리가 깊이 3 계층을 렌더한다", async () => {
    renderApp();
    // 개요 화면이 생기기 전에는 첫 루트 페이지로 곧장 redirect했다 — 이제 스페이스에서 멈춘다.
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1");
    });
    expect(screen.getByTestId("location")).not.toHaveTextContent("/pages/");
    // 트리는 페이지 목록 로드 후 스켈레톤을 대체한다 — 로드 완료를 기다린다(경합 방지)
    await screen.findByRole("navigation", { name: "페이지 트리" });
    const tree = treeIn();
    // 루트 2 + 하위 2 + 손자 1 전부 표시 (기본 펼침)
    expect(tree.getByRole("link", { name: "시작하기" })).toBeInTheDocument();
    expect(tree.getByRole("link", { name: "팀 규칙" })).toBeInTheDocument();
    expect(tree.getByRole("link", { name: "개발 환경 설정" })).toBeInTheDocument();
    expect(tree.getByRole("link", { name: "배포 가이드" })).toBeInTheDocument();
    expect(tree.getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
  });

  it("토글로 하위를 접으면 손자 페이지가 사라지고, 다시 펼치면 나타난다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });
    expect(treeIn().getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "개발 환경 설정 하위 접기" }));
    expect(treeIn().queryByRole("link", { name: "로컬 DB 설정" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "개발 환경 설정 하위 펼치기" }));
    expect(treeIn().getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
  });

  it("트리에서 다른 페이지를 클릭하면 URL이 바뀌고 그 페이지가 표시되며 트리에 하이라이트된다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(treeIn().getByRole("link", { name: "팀 규칙" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg2");
    });
    expect(await screen.findByRole("heading", { level: 1, name: "팀 규칙" })).toBeInTheDocument();
    // 현재 페이지 하이라이트 — 개요에서 페이지로 들어온 뒤에야 aria-current가 붙는다
    expect(treeIn().getByRole("link", { name: "팀 규칙" })).toHaveAttribute("aria-current", "page");
  });

  it("새 스페이스를 만들면 스위처에 반영되고, 페이지 0개 EmptyState가 보인다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });
    // 헤더 "만들기" 드롭다운 → "새 스페이스" → 모달 열기 → 입력 → 생성
    await user.click(screen.getByRole("button", { name: "만들기" }));
    await user.click(await screen.findByRole("menuitem", { name: "새 스페이스" }));
    await user.type(screen.getByLabelText("이름"), "설계 위키");
    await user.type(screen.getByLabelText("키"), "arch");
    expect(screen.getByLabelText("키")).toHaveValue("ARCH"); // 자동 대문자
    await user.click(screen.getByRole("button", { name: "만들기" }));
    // 스위처(현재 스페이스 버튼)가 새 스페이스로 바뀌고 그 스페이스로 이동
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "스페이스 전환: 설계 위키" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("location").textContent).toMatch(/^\/spaces\/[^/]+$/);
    // 새 스페이스는 페이지 0개 → 안내문 EmptyState (만들기 버튼은 W2)
    expect(
      await screen.findByRole("heading", { name: "아직 페이지가 없습니다" }),
    ).toBeInTheDocument();
  });
});
