import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, createPage } from "../features/wiki/store/wikiStore";

/*
 * 사람 디렉터리(/api/org/members)와 로그인 사용자(/api/me)는 공개 인스턴스에서 403·401이다.
 * "화면에 이름이 안 보인다"만으로는 요청을 보냈는지 알 수 없어 스토어 경계에 스파이를 건다
 * (실제 구현으로 위임하므로 다른 케이스의 동작은 그대로다).
 */
const storeSpies = vi.hoisted(() => ({ listUsers: vi.fn(), getCurrentUser: vi.fn() }));

vi.mock("../features/wiki/store/wikiStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/wiki/store/wikiStore")>();
  storeSpies.listUsers.mockImplementation(actual.listUsers);
  storeSpies.getCurrentUser.mockImplementation(actual.getCurrentUser);
  return { ...actual, listUsers: storeSpies.listUsers, getCurrentUser: storeSpies.getCurrentUser };
});

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  storeSpies.listUsers.mockClear();
  storeSpies.getCurrentUser.mockClear();
});

/**
 * W28 공개 문서 인스턴스 — 읽기 전용 모드.
 *
 * 설계: `docs/superpowers/specs/2026-09-04-public-docs-instance-design.md` §2.2.
 * 여기서 검증하는 것은 "서버가 막는다"가 아니라 "화면이 없는 것을 권하지 않는다"이다 —
 * 쓰기 어포던스가 남아 있으면 익명 사용자가 눌러 403을 받는다.
 */
describe("W28 읽기 전용 문서 인스턴스", () => {
  it("상단바에 읽기 전용 배지가 뜨고 만들기·알림은 없다", async () => {
    renderApp("/spaces/sp1/pages/pg1", { readOnly: true });

    expect(await screen.findByText("읽기 전용 문서")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "만들기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /알림/ })).not.toBeInTheDocument();
    // 아바타는 /api/me를 부르지 않으므로 사용자 메뉴 자체가 없다
    expect(screen.queryByRole("button", { name: "사용자 메뉴" })).not.toBeInTheDocument();
  });

  it("문서 화면에 편집·별표·공유·댓글 폼이 없고 내보내기·전체 너비는 남는다", async () => {
    renderApp("/spaces/sp1/pages/pg1", { readOnly: true });

    expect(await screen.findByRole("heading", { name: "시작하기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "편집" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "별표" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공유" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "페이지 제한" })).not.toBeInTheDocument();
    // 읽기 어포던스는 그대로
    expect(screen.getByRole("button", { name: "전체 너비" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "더 보기" })).toBeInTheDocument();

    // 코멘트는 읽히지만 작성 폼이 없다
    expect(await screen.findByRole("region", { name: "코멘트" })).toBeInTheDocument();
    expect(screen.queryByLabelText("코멘트 작성")).not.toBeInTheDocument();
    // 첨부는 목록만 — 업로드 버튼 없음
    expect(screen.queryByRole("button", { name: "파일 첨부" })).not.toBeInTheDocument();
    // 라벨 편집 진입점 없음
    expect(screen.queryByRole("button", { name: "라벨 추가" })).not.toBeInTheDocument();
  });

  it("페이지 트리에 하위 콘텐츠 추가(+)와 행 메뉴가 없다", async () => {
    renderApp("/spaces/sp1/pages/pg1", { readOnly: true });

    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    expect(within(tree).queryByRole("button", { name: /하위 콘텐츠 추가/ })).not.toBeInTheDocument();
    expect(within(tree).queryByRole("button", { name: /하위 페이지 추가/ })).not.toBeInTheDocument();
    expect(within(tree).queryByRole("button", { name: /더보기/ })).not.toBeInTheDocument();
    // 트리 자체는 살아 있다 — 읽기가 목적이다
    expect(within(tree).getByRole("link", { name: /시작하기/ })).toBeInTheDocument();
  });

  it("편집 라우트로 들어오면 스페이스 홈으로 돌린다", async () => {
    renderApp("/spaces/sp1/pages/pg1/edit", { readOnly: true });

    expect(await screen.findByTestId("location")).toHaveTextContent("/spaces/sp1");
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  });

  it("새 문서·설정·휴지통·보관함 라우트도 스페이스 홈으로 돌린다", async () => {
    for (const path of [
      "/spaces/sp1/pages/new",
      "/spaces/sp1/settings",
      "/spaces/sp1/settings/permissions",
      "/spaces/sp1/trash",
      "/spaces/sp1/archive",
    ]) {
      const view = renderApp(path, { readOnly: true });
      expect(await screen.findByTestId("location")).toHaveTextContent("/spaces/sp1");
      view.unmount();
    }
  });

  it("사이드바에서 개인·관리 진입점(내 스페이스·내 작업·휴지통·보관함)이 빠진다", async () => {
    renderApp("/spaces/sp1", { readOnly: true });

    await screen.findByRole("navigation", { name: "페이지 트리" });
    expect(screen.queryByRole("button", { name: "내 스페이스" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "내 작업" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "휴지통" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "보관함" })).not.toBeInTheDocument();
    // 콘텐츠 만들기 "+"도 없다
    expect(screen.queryByRole("button", { name: "콘텐츠 만들기" })).not.toBeInTheDocument();
    // 탐색용 링크는 남는다
    expect(screen.getByRole("link", { name: "블로그" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "라벨" })).toBeInTheDocument();
  });

  it("스페이스 개요·블로그의 생성 버튼이 없다", async () => {
    renderApp("/spaces/sp1", { readOnly: true });
    expect(await screen.findByRole("heading", { name: "개발 위키", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새 콘텐츠" })).not.toBeInTheDocument();

    const view = renderApp("/spaces/sp1/blog", { readOnly: true });
    expect(await within(view.container).findByRole("heading", { name: "블로그" })).toBeInTheDocument();
    expect(within(view.container).queryByRole("button", { name: "글 쓰기" })).not.toBeInTheDocument();
  });

  it("부재 위키링크는 링크가 아니라 글자로 남는다(생성 라우트가 없으므로)", async () => {
    const page = await createPage({
      spaceId: "sp1",
      parentId: null,
      title: "링크 모음",
      type: "page",
      body: "[[없는 문서]] 참고",
    });

    renderApp(`/spaces/sp1/pages/${page.id}`, { readOnly: true });

    // 대상이 없으므로 생성 화면 링크가 되던 자리 — 읽기 전용에서는 그냥 글자다
    expect(await screen.findByText("없는 문서")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "없는 문서" })).not.toBeInTheDocument();
  });

  it("스페이스 디렉토리에 별표 토글도 별표 목록도 없다", async () => {
    // /docs와 /wiki가 같은 오리진이면 별표 사본이 공유된다 — 남의 별표가 새어 들면 안 된다
    localStorage.setItem("wiki.ui.starredSpaces", JSON.stringify(["sp1"]));

    renderApp("/spaces", { readOnly: true });

    expect(await screen.findByRole("heading", { name: "스페이스", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /별표/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "자주 찾는 스페이스" })).not.toBeInTheDocument();
    expect(screen.queryByText("자주 찾는 스페이스")).not.toBeInTheDocument();
  });

  it("스페이스 플라이아웃에도 별표 버튼이 없다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.ui.starredSpaces", JSON.stringify(["sp1"]));

    renderApp("/spaces/sp1", { readOnly: true });

    await user.click(await screen.findByRole("button", { name: /스페이스 전환/ }));
    const flyout = await screen.findByRole("dialog", { name: "스페이스 전환" });
    expect(within(flyout).queryByRole("button", { name: /별표/ })).not.toBeInTheDocument();
    expect(within(flyout).queryByText("별표 표시됨")).not.toBeInTheDocument();
    // 이동은 되어야 한다 — 플라이아웃의 본래 목적이다
    expect(within(flyout).getAllByRole("button", { name: /개발 위키/ }).length).toBeGreaterThan(0);
  });

  it("사람 디렉터리·로그인 사용자를 조회하지 않고 '사용자 #' 폴백도 노출하지 않는다", async () => {
    renderApp("/spaces/sp1/pages/pg1", { readOnly: true });

    expect(await screen.findByRole("heading", { name: "시작하기" })).toBeInTheDocument();
    await screen.findByRole("region", { name: "코멘트" });

    expect(storeSpies.listUsers).not.toHaveBeenCalled();
    expect(storeSpies.getCurrentUser).not.toHaveBeenCalled();
    // 임포터 계정이 "사용자 #1"로 새어 나오면 안 된다
    expect(screen.queryByText(/사용자 #/)).not.toBeInTheDocument();
    // "언제"는 남는다 — 사람만 빠진다
    expect(screen.getByText("2026년 7월 10일 수정")).toBeInTheDocument();
  });

  it("스페이스 개요·폴더·디렉토리에서도 사람 디렉터리를 부르지 않는다", async () => {
    for (const path of ["/spaces/sp1", "/spaces", "/home"]) {
      const view = renderApp(path, { readOnly: true });
      await waitFor(() => expect(screen.queryByText("불러오는 중")).not.toBeInTheDocument());
      expect(screen.queryByText(/사용자 #/)).not.toBeInTheDocument();
      view.unmount();
    }
    expect(storeSpies.listUsers).not.toHaveBeenCalled();
    expect(storeSpies.getCurrentUser).not.toHaveBeenCalled();
  });

  it("기본(팀 위키) 모드는 사람 디렉터리를 그대로 조회한다", async () => {
    renderApp("/spaces/sp1/pages/pg1");

    expect(await screen.findByRole("button", { name: "편집" })).toBeInTheDocument();
    await waitFor(() => expect(storeSpies.listUsers).toHaveBeenCalled());
    expect(storeSpies.getCurrentUser).toHaveBeenCalled();
  });

  it("기본(팀 위키) 모드는 그대로다 — 배지 없이 편집·만들기가 보인다", async () => {
    renderApp("/spaces/sp1/pages/pg1");

    expect(await screen.findByRole("button", { name: "편집" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "만들기" })).toBeInTheDocument();
    expect(screen.queryByText("읽기 전용 문서")).not.toBeInTheDocument();
  });
});
