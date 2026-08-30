import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MarkdownView } from "./MarkdownView";
import { __resetForTest, createPage, setLabels } from "../store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** 속성 보고서(W23) — 라벨이 붙은 문서들의 속성 표를 한 표로. */
describe("PropertiesReport", () => {
  it("라벨이 붙은 문서의 속성을 열로 합쳐 한 표로 그린다", async () => {
    const a = await createPage({
      spaceId: "sp1", parentId: null, title: "결제 개편", type: "page",
      body: ":::properties\n| 항목 | 값 |\n| --- | --- |\n| 담당자 | 김철수 |\n| 상태 | :status[진행 중]{.info} |\n:::",
    });
    const b = await createPage({
      spaceId: "sp1", parentId: null, title: "검색 고도화", type: "page",
      body: ":::properties\n| 담당자 | 이영희 |\n| 기한 | 9월 |\n:::",
    });
    await setLabels(a.id, ["프로젝트"]);
    await setLabels(b.id, ["프로젝트"]);

    render(
      <MemoryRouter>
        <MarkdownView markdown={"::properties-report[프로젝트]"} spaceId="sp1" />
      </MemoryRouter>,
    );

    const table = await screen.findByRole("table", { name: "속성 보고서: 프로젝트" });
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["문서", "담당자", "상태", "기한"]);
    expect(within(table).getByRole("link", { name: "결제 개편" })).toBeInTheDocument();
    expect(within(table).getByText("진행 중")).toBeInTheDocument();
    expect(within(table).getByText("이영희")).toBeInTheDocument();
  });

  it("속성 표가 있는 문서가 없으면 그렇다고 말한다", async () => {
    render(
      <MemoryRouter>
        <MarkdownView markdown={"::properties-report[없는라벨]"} spaceId="sp1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/속성 표.*가 있는 문서가 없습니다/)).toBeInTheDocument();
  });
});
