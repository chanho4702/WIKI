import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MarkdownView } from "./MarkdownView";
import { __resetForTest, createPage, setLabels, updatePage } from "../store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

async function seed(title: string, labels: string[] = []) {
  const page = await createPage({ spaceId: "sp1", parentId: null, title, type: "page", body: title });
  if (labels.length > 0) await setLabels(page.id, labels);
  return page;
}

/** 콘텐츠 매크로(W27-3) — 라벨별 문서 목록·최근 업데이트. */
describe("::pages-by-label", () => {
  it("라벨이 붙은 문서를 제목 링크 목록으로 그린다", async () => {
    await seed("결제 개편", ["프로젝트"]);
    await seed("검색 고도화", ["프로젝트"]);
    await seed("무관한 문서");

    render(
      <MemoryRouter>
        <MarkdownView markdown={"::pages-by-label[프로젝트]"} spaceId="sp1" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "결제 개편" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "검색 고도화" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "무관한 문서" })).not.toBeInTheDocument();
  });

  it("편집기 왕복으로 대괄호가 이스케이프된 형태도 같은 목록으로 그린다", async () => {
    await seed("결제 개편", ["프로젝트"]);

    render(
      <MemoryRouter>
        <MarkdownView markdown={"::pages-by-label\\[프로젝트\\]"} spaceId="sp1" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "결제 개편" })).toBeInTheDocument();
  });

  it("해당 라벨의 문서가 없으면 그렇다고 말한다", async () => {
    render(
      <MemoryRouter>
        <MarkdownView markdown={"::pages-by-label[없는라벨]"} spaceId="sp1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/“없는라벨” 라벨이 붙은 문서가 없습니다/)).toBeInTheDocument();
  });

  it("스페이스를 모르는 렌더(미리보기·내보내기)에서는 마커 텍스트로 남는다", () => {
    const { container } = render(<MarkdownView markdown={"::pages-by-label[프로젝트]"} />);
    expect(container.querySelector(".md-pages-by-label.is-inert")).toHaveTextContent(
      "::pages-by-label[프로젝트]",
    );
  });
});

describe("::recently-updated", () => {
  it("최근 수정 순으로 기본 5건을 그린다", async () => {
    for (const title of ["문서1", "문서2", "문서3", "문서4", "문서5", "문서6"]) {
      const page = await seed(title);
      await updatePage(page.id, { body: `${title} 수정` }, { expectedVersion: page.version });
    }

    const { container } = render(
      <MemoryRouter>
        <MarkdownView markdown={"::recently-updated"} spaceId="sp1" />
      </MemoryRouter>,
    );

    // 순서는 여기서 단언하지 않는다 — 여섯 건이 같은 밀리초에 저장되면 updatedAt이 동률이라
    // 어느 문서가 위인지 정해지지 않는다(정렬 자체는 store 테스트가 본다). 이 매크로가 보장하는
    // 것은 "기본 5건만 그린다"이다.
    await waitFor(() => expect(container.querySelector(".md-content-macro-list")).not.toBeNull());
    const list = container.querySelector(".md-content-macro-list")!;
    expect(within(list as HTMLElement).getAllByRole("link")).toHaveLength(5);
  });

  it("limit 속성으로 건수를 정한다", async () => {
    for (const title of ["문서1", "문서2", "문서3", "문서4"]) await seed(title);

    const { container } = render(
      <MemoryRouter>
        <MarkdownView markdown={"::recently-updated{limit=2}"} spaceId="sp1" />
      </MemoryRouter>,
    );

    // 어느 문서가 위인지는 여기서 중요하지 않다 — 같은 밀리초에 만들어져 동률이다
    await waitFor(() => expect(container.querySelector(".md-content-macro-list")).not.toBeNull());
    const list = container.querySelector(".md-content-macro-list")!;
    expect(within(list as HTMLElement).getAllByRole("link")).toHaveLength(2);
  });

  it("문서가 없으면 그렇다고 말한다", async () => {
    render(
      <MemoryRouter>
        <MarkdownView markdown={"::recently-updated{limit=5}"} spaceId="sp-empty" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("최근 업데이트된 문서가 없습니다")).toBeInTheDocument();
  });
});
