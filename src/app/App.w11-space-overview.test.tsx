import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/** 개요 본문의 콘텐츠 섹션 — 사이드바 트리와 페이지 제목이 겹치므로 항상 이 스코프로 좁힌다.
 * 사이드바에도 "콘텐츠" 섹션이 있어 이름이 달라야 한다("스페이스 콘텐츠"). */
const contentSection = () => within(screen.getByRole("region", { name: "스페이스 콘텐츠" }));

describe("W11 스페이스 개요 (/spaces/:spaceId)", () => {
  it("스페이스를 열면 첫 페이지로 튕기지 않고 개요가 뜬다", async () => {
    renderApp("/spaces/sp1");

    expect(await screen.findByRole("heading", { level: 1, name: "개발 위키" })).toBeInTheDocument();
    expect(screen.getByText("DEV")).toBeInTheDocument();
    // 예전 동작(첫 루트 페이지로 redirect)으로 되돌아가지 않았는지 URL로 확인한다
    expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1");
    expect(screen.getByTestId("location")).not.toHaveTextContent("/pages/");
  });

  /**
   * 2026-08-29: 개요는 **최상위만** 보여준다. 전체 계층을 펼치려면 전 페이지를 받아야 했고
   * 그것이 이 화면의 규모 상한이었다. 아래로 내려가는 일은 사이드바 트리와 각 문서가 맡는다.
   */
  it("콘텐츠 섹션이 최상위 문서만 보여준다", async () => {
    renderApp("/spaces/sp1");
    await screen.findByRole("heading", { level: 1, name: "개발 위키" });

    const content = contentSection();
    expect(content.getByRole("link", { name: /시작하기/ })).toBeInTheDocument();
    expect(content.getByRole("link", { name: /팀 규칙/ })).toBeInTheDocument();
    expect(content.queryByRole("link", { name: /개발 환경 설정/ })).not.toBeInTheDocument();
    expect(content.queryByRole("link", { name: /로컬 DB 설정/ })).not.toBeInTheDocument();
  });

  it("자식이 있는 문서는 직계 하위 수를 함께 보여준다 — 아이콘만으로 구분하지 않는다", async () => {
    renderApp("/spaces/sp1");
    await screen.findByRole("heading", { level: 1, name: "개발 위키" });

    // 시드: 시작하기(pg1) > 개발 환경 설정·배포 가이드 → 직계 2개.
    // 손자까지 세지 않는 이유는 그러려면 후손을 전부 받아야 하기 때문이다.
    expect(contentSection().getByRole("link", { name: /시작하기/ })).toHaveTextContent("하위 2개");
    expect(contentSection().getByRole("link", { name: /팀 규칙/ })).not.toHaveTextContent("하위");
  });

  it("콘텐츠 목록의 항목을 클릭하면 그 페이지로 이동한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("heading", { level: 1, name: "개발 위키" });

    await user.click(contentSection().getByRole("link", { name: /팀 규칙/ }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg2");
    });
    expect(await screen.findByRole("heading", { level: 1, name: "팀 규칙" })).toBeInTheDocument();
  });

  it("최근 업데이트 섹션이 수정 시각 내림차순으로 페이지를 보여준다", async () => {
    renderApp("/spaces/sp1");
    await screen.findByRole("heading", { level: 1, name: "개발 위키" });

    const recent = within(screen.getByRole("region", { name: "최근 업데이트" }));
    const titles = recent.getAllByRole("link").map((a) => a.textContent?.trim());
    expect(titles).toHaveLength(5);

    // 시드에서 updatedAt이 뒤인 페이지는 pg1("시작하기")뿐이고 나머지는 동률이다 —
    // 동률 간 순서까지 고정하면 시드 배열 순서에 묶이므로, 검증은 두 가지로 한다.
    expect(titles[0]).toBe("시작하기");

    // 렌더 순서가 updatedAt 내림차순을 지키는지(동률 허용)
    const updatedAtByTitle = new Map(
      createSeedData().pages.filter((p) => p.spaceId === "sp1").map((p) => [p.title, p.updatedAt]),
    );
    const stamps = titles.map((t) => updatedAtByTitle.get(t!)!);
    expect(stamps.every((s, i) => i === 0 || stamps[i - 1] >= s)).toBe(true);
  });

  it("페이지가 0개인 스페이스에서는 기존 '첫 페이지 만들기' 안내를 유지한다", async () => {
    const user = userEvent.setup();
    const seed = createSeedData();
    seed.spaces.push({ id: "sp2", key: "EMPTY", name: "빈 위키", createdAt: seed.spaces[0].createdAt });
    localStorage.setItem("wiki.v1", JSON.stringify(seed));
    renderApp("/spaces/sp2");

    expect(
      await screen.findByRole("heading", { name: "아직 페이지가 없습니다" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "첫 페이지 만들기" }));
    // 초안을 실제로 만들고 그 편집 화면을 연다(예전엔 아직 없는 /pages/new로 이동만 했다)
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(
        /^\/spaces\/sp2\/pages\/[^/]+\/edit$/,
      );
    });
  });

  it("개요의 '새 페이지'는 루트 초안을 만들어 트리에 세운다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("heading", { level: 1, name: "개발 위키" });

    // 헤더(셸)의 "만들기"와 구분되는, 개요 자체의 액션 — 이제 페이지/폴더를 고른다
    await user.click(screen.getByRole("button", { name: "새 콘텐츠" }));
    await user.click(await screen.findByRole("menuitem", { name: "페이지" }));
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(
        /^\/spaces\/sp1\/pages\/[^/]+\/edit$/,
      );
    });
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(tree).getByRole("link", { name: "제목 없음 초안" })).toBeInTheDocument();
  });
});
