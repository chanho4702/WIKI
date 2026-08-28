import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ChildPages } from "./ChildPages";
import { __resetForTest, createPage } from "../store/wikiStore";
import { createSeedData } from "../../../mock/seed";

/**
 * 자식 목록은 서버(스토어)에서 직계만 읽는다(2026-08-28) — 예전에는 화면이 들고 있던
 * 스페이스 전 페이지를 prop으로 받아 걸렀다. 그래서 이 테스트도 배열 조립 대신 스토어를 쓴다.
 *
 * 시드 sp1: pg1(시작하기) > pg3(개발 환경 설정, 1) · pg4(배포 가이드, 2), pg3 > pg5.
 */
function renderFor(pageId: string) {
  return render(
    <MemoryRouter>
      <ChildPages currentPageId={pageId} spaceId="sp1" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

describe("ChildPages", () => {
  it("자식 페이지가 없으면 아무것도 그리지 않는다", async () => {
    const { container } = renderFor("pg2");

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("자식 페이지를 position 오름차순 링크 목록으로 렌더한다", async () => {
    renderFor("pg1");

    expect(
      await screen.findByRole("heading", { level: 2, name: "하위 페이지" }),
    ).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("개발 환경 설정");
    expect(links[1]).toHaveTextContent("배포 가이드");
  });

  it("각 자식 페이지 링크가 올바른 URL을 가진다", async () => {
    renderFor("pg1");

    const links = await screen.findAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/spaces/sp1/pages/pg3");
    expect(links[1]).toHaveAttribute("href", "/spaces/sp1/pages/pg4");
  });

  it("다른 부모의 자식은 포함하지 않는다", async () => {
    await createPage({ spaceId: "sp1", parentId: "pg2", title: "규칙 상세" });
    renderFor("pg1");

    const links = await screen.findAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.textContent)).not.toContain("규칙 상세");
  });

  it("손자는 포함하지 않는다 — 직계만 읽는다", async () => {
    renderFor("pg1");

    const links = await screen.findAllByRole("link");
    expect(links.map((l) => l.textContent)).not.toContain("로컬 DB 설정");
  });

  it("섹션 컨테이너와 목록 구조를 유지한다", async () => {
    const { container } = renderFor("pg1");

    await screen.findByRole("heading", { level: 2, name: "하위 페이지" });
    expect(container.querySelector("section.child-pages")).toBeInTheDocument();
    expect(container.querySelector("ul")?.querySelectorAll("li")).toHaveLength(2);
  });
});
