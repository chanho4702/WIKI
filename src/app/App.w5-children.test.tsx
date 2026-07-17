import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W5 하위 페이지 목록", () => {
  it("자식 페이지가 있는 페이지를 보면 '하위 페이지' 섹션이 나타나고 링크를 표시한다", async () => {
    // 시드 데이터: pg1("시작하기")의 하위는 pg3("개발 환경 설정"), pg4("배포 가이드")
    renderApp("/spaces/sp1/pages/pg1");

    // 페이지 제목
    expect(await screen.findByRole("heading", { level: 1, name: "시작하기" })).toBeInTheDocument();

    // 하위 페이지 섹션
    const childSection = await screen.findByRole("heading", { level: 2, name: "하위 페이지" });
    expect(childSection).toBeInTheDocument();

    // section.child-pages 확인
    const section = childSection.closest("section.child-pages") as HTMLElement | null;
    expect(section).toBeInTheDocument();

    // 하위 페이지 링크들
    const links = within(section!).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent("개발 환경 설정");
    expect(links[1]).toHaveTextContent("배포 가이드");
  });

  it("하위 페이지 링크를 클릭하면 해당 페이지로 이동한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");

    // 하위 페이지 섹션 로드
    const childSection = await screen.findByRole("heading", { level: 2, name: "하위 페이지" });
    const section = childSection.closest("section.child-pages") as HTMLElement | null;

    // "개발 환경 설정" 링크 클릭
    const link = within(section!).getByRole("link", { name: "개발 환경 설정" });
    await user.click(link);

    // pg3 페이지로 이동
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg3");
    });
    expect(await screen.findByRole("heading", { level: 1, name: "개발 환경 설정" })).toBeInTheDocument();

    // pg3도 자식 페이지가 있음 (pg5)
    const childSection2 = await screen.findByRole("heading", { level: 2, name: "하위 페이지" });
    expect(childSection2).toBeInTheDocument();
    const section2 = childSection2.closest("section.child-pages") as HTMLElement | null;
    const childLink = within(section2!).getByRole("link", { name: "로컬 DB 설정" });
    expect(childLink).toHaveAttribute("href", "/spaces/sp1/pages/pg5");
  });

  it("자식 페이지가 없는 페이지를 보면 '하위 페이지' 섹션이 나타나지 않는다", async () => {
    // pg2("팀 규칙")은 하위 페이지가 없음
    renderApp("/spaces/sp1/pages/pg2");

    expect(await screen.findByRole("heading", { level: 1, name: "팀 규칙" })).toBeInTheDocument();

    // 하위 페이지 섹션이 없어야 함
    expect(screen.queryByRole("heading", { level: 2, name: "하위 페이지" })).not.toBeInTheDocument();
  });

  it("하위 페이지들이 position 순서대로 표시된다", async () => {
    renderApp("/spaces/sp1/pages/pg1");

    const childSection = await screen.findByRole("heading", { level: 2, name: "하위 페이지" });
    const section = childSection.closest("section.child-pages") as HTMLElement | null;
    const links = within(section!).getAllByRole("link");

    // 시드 데이터에서 pg3은 position=1, pg4는 position=2
    expect(links[0]).toHaveTextContent("개발 환경 설정"); // position 1
    expect(links[1]).toHaveTextContent("배포 가이드"); // position 2
  });

  it("깊이 3의 페이지(pg5)도 하위 페이지가 있으면 표시한다", async () => {
    // pg5("로컬 DB 설정")는 자식이 없지만, pg3은 pg5를 하위로 가짐
    renderApp("/spaces/sp1/pages/pg3");

    expect(await screen.findByRole("heading", { level: 1, name: "개발 환경 설정" })).toBeInTheDocument();

    const childSection = await screen.findByRole("heading", { level: 2, name: "하위 페이지" });
    expect(childSection).toBeInTheDocument();

    const section = childSection.closest("section.child-pages") as HTMLElement | null;
    const links = within(section!).getAllByRole("link");
    expect(links[0]).toHaveTextContent("로컬 DB 설정");
  });
});
