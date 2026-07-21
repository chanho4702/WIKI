import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Page } from "../store/types";
import { ChildPages } from "./ChildPages";

describe("ChildPages", () => {
  const createPage = (overrides: Partial<Page> = {}): Page => ({
    id: "pg-test",
    spaceId: "sp1",
    parentId: null,
    title: "테스트 페이지",
    body: "# 테스트",
    version: 1,
    position: 1,
    createdBy: "u1",
    updatedBy: "u1",
    createdAt: "2026-07-10T09:00:00.000Z",
    updatedAt: "2026-07-10T09:00:00.000Z",
    ...overrides,
  });

  it("자식 페이지가 없으면 null을 반환한다", () => {
    const pages: Page[] = [
      createPage({ id: "pg1", title: "시작하기" }),
      createPage({ id: "pg2", title: "팀 규칙" }),
    ];

    const { container } = render(
      <MemoryRouter>
        <ChildPages pages={pages} currentPageId="pg1" spaceId="sp1" />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("자식 페이지들을 position 오름차순으로 정렬해 링크 목록으로 렌더한다", () => {
    const pages: Page[] = [
      createPage({ id: "pg1", title: "시작하기" }),
      // pg1의 자식: position 순서 (2, 1, 3)로 입력 — 정렬 검증용
      createPage({ id: "pg3", parentId: "pg1", title: "배포 가이드", position: 2 }),
      createPage({ id: "pg2", parentId: "pg1", title: "개발 환경 설정", position: 1 }),
      createPage({ id: "pg4", parentId: "pg1", title: "운영 수칙", position: 3 }),
    ];

    render(
      <MemoryRouter>
        <ChildPages pages={pages} currentPageId="pg1" spaceId="sp1" />
      </MemoryRouter>,
    );

    // 제목 확인
    expect(screen.getByRole("heading", { level: 2, name: "하위 페이지" })).toBeInTheDocument();

    // position 정렬 순서 확인: pg2(1) → pg3(2) → pg4(3)
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("개발 환경 설정");
    expect(links[1]).toHaveTextContent("배포 가이드");
    expect(links[2]).toHaveTextContent("운영 수칙");
  });

  it("각 자식 페이지 링크가 올바른 URL을 가진다", () => {
    const pages: Page[] = [
      createPage({ id: "pg1", title: "시작하기" }),
      createPage({ id: "pg3", parentId: "pg1", title: "개발 환경 설정", position: 1 }),
      createPage({ id: "pg4", parentId: "pg1", title: "배포 가이드", position: 2 }),
    ];

    render(
      <MemoryRouter>
        <ChildPages pages={pages} currentPageId="pg1" spaceId="sp1" />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/spaces/sp1/pages/pg3");
    expect(links[1]).toHaveAttribute("href", "/spaces/sp1/pages/pg4");
  });

  it("다른 부모의 페이지는 포함하지 않는다 (필터링 정확성)", () => {
    const pages: Page[] = [
      createPage({ id: "pg1", title: "시작하기" }),
      createPage({ id: "pg2", title: "팀 규칙" }),
      // pg1의 자식
      createPage({ id: "pg3", parentId: "pg1", title: "개발 환경 설정", position: 1 }),
      // pg2의 자식
      createPage({ id: "pg4", parentId: "pg2", title: "규칙 상세", position: 1 }),
    ];

    render(
      <MemoryRouter>
        <ChildPages pages={pages} currentPageId="pg1" spaceId="sp1" />
      </MemoryRouter>,
    );

    // pg1만 요청했으므로 pg3만 표시되어야 함
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("개발 환경 설정");
  });

  it("섹션 컨테이너에 올바른 클래스명을 적용한다", () => {
    const pages: Page[] = [
      createPage({ id: "pg1", title: "시작하기" }),
      createPage({ id: "pg2", parentId: "pg1", title: "하위 페이지", position: 1 }),
    ];

    const { container } = render(
      <MemoryRouter>
        <ChildPages pages={pages} currentPageId="pg1" spaceId="sp1" />
      </MemoryRouter>,
    );

    const section = container.querySelector("section.child-pages");
    expect(section).toBeInTheDocument();
  });

  it("리스트가 <ul> 요소로 렌더된다", () => {
    const pages: Page[] = [
      createPage({ id: "pg1", title: "시작하기" }),
      createPage({ id: "pg2", parentId: "pg1", title: "하위 페이지", position: 1 }),
    ];

    const { container } = render(
      <MemoryRouter>
        <ChildPages pages={pages} currentPageId="pg1" spaceId="sp1" />
      </MemoryRouter>,
    );

    const list = container.querySelector("ul");
    expect(list).toBeInTheDocument();
    expect(list?.querySelectorAll("li")).toHaveLength(1);
  });
});
