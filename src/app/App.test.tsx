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

  it("루트 접근 시 첫 스페이스의 첫 루트 페이지로 redirect하고, 트리가 깊이 3 계층을 렌더한다", async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg1");
    });
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    // 루트 2 + 하위 2 + 손자 1 전부 표시 (기본 펼침)
    expect(within(tree).getByRole("link", { name: "시작하기" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "팀 규칙" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "개발 환경 설정" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "배포 가이드" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
    // 현재 페이지(시작하기) 하이라이트
    expect(within(tree).getByRole("link", { name: "시작하기" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("토글로 하위를 접으면 손자 페이지가 사라지고, 다시 펼치면 나타난다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("link", { name: "로컬 DB 설정" });
    await user.click(screen.getByRole("button", { name: "개발 환경 설정 하위 접기" }));
    expect(screen.queryByRole("link", { name: "로컬 DB 설정" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "개발 환경 설정 하위 펼치기" }));
    expect(screen.getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
  });

  it("트리에서 다른 페이지를 클릭하면 URL이 바뀌고 그 페이지가 표시된다", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("link", { name: "팀 규칙" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg2");
    });
    expect(await screen.findByRole("heading", { name: "팀 규칙" })).toBeInTheDocument();
  });

  it("새 스페이스를 만들면 스위처에 반영되고, 페이지 0개 EmptyState가 보인다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("link", { name: "시작하기" });
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
