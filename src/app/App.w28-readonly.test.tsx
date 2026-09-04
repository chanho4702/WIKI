import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderApp } from "./testUtils";
import { __resetForTest, createPage } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
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

  it("기본(팀 위키) 모드는 그대로다 — 배지 없이 편집·만들기가 보인다", async () => {
    renderApp("/spaces/sp1/pages/pg1");

    expect(await screen.findByRole("button", { name: "편집" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "만들기" })).toBeInTheDocument();
    expect(screen.queryByText("읽기 전용 문서")).not.toBeInTheDocument();
  });
});
