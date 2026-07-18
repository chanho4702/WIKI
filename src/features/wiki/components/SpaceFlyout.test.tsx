import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpaceFlyout } from "./SpaceFlyout";
import { setStarredSpaces } from "../lib/starredSpaces";
import type { Space } from "../store/types";

const SPACES: Space[] = [
  { id: "sp1", key: "DEV", name: "개발 위키", createdAt: "2026-01-01" },
  { id: "sp2", key: "OPS", name: "운영 위키", createdAt: "2026-01-02" },
  { id: "sp3", key: "ARCH", name: "설계 위키", createdAt: "2026-01-03" },
];

beforeEach(() => {
  localStorage.clear();
});

function setup(overrides: Partial<Parameters<typeof SpaceFlyout>[0]> = {}) {
  const onNavigate = vi.fn();
  const onCreateClick = vi.fn();
  render(
    <SpaceFlyout
      spaces={SPACES}
      currentSpaceId="sp1"
      onNavigate={onNavigate}
      onCreateClick={onCreateClick}
      {...overrides}
    />,
  );
  return { onNavigate, onCreateClick };
}

describe("SpaceFlyout", () => {
  it("마운트되면 필터 입력에 포커스된다", () => {
    setup();
    expect(screen.getByPlaceholderText("스페이스 필터")).toHaveFocus();
  });

  it("'현재' 섹션엔 현재 스페이스만, '모든 스페이스' 섹션엔 전체가 보인다", () => {
    setup();
    const currentSection = screen.getByRole("heading", { name: "현재" }).closest("section")!;
    expect(within(currentSection).getByRole("button", { name: "개발 위키 (DEV)" })).toBeInTheDocument();
    expect(within(currentSection).queryByRole("button", { name: "운영 위키 (OPS)" })).not.toBeInTheDocument();

    const allSection = screen.getByRole("heading", { name: "모든 스페이스" }).closest("section")!;
    expect(within(allSection).getByRole("button", { name: "개발 위키 (DEV)" })).toBeInTheDocument();
    expect(within(allSection).getByRole("button", { name: "운영 위키 (OPS)" })).toBeInTheDocument();
    expect(within(allSection).getByRole("button", { name: "설계 위키 (ARCH)" })).toBeInTheDocument();
  });

  it("별표가 없으면 '별표 표시됨' 섹션 자체가 없다", () => {
    setup();
    expect(screen.queryByRole("heading", { name: "별표 표시됨" })).not.toBeInTheDocument();
  });

  it("별표된 스페이스가 있으면 '별표 표시됨' 섹션에 나타나고, 현재 스페이스는 제외된다", () => {
    setStarredSpaces(["sp1", "sp2"]);
    setup();
    const starredSection = screen.getByRole("heading", { name: "별표 표시됨" }).closest("section")!;
    expect(within(starredSection).getByRole("button", { name: "운영 위키 (OPS)" })).toBeInTheDocument();
    expect(within(starredSection).queryByRole("button", { name: "개발 위키 (DEV)" })).not.toBeInTheDocument();
  });

  it("필터 입력으로 이름/키 대소문자 무시 부분 일치로 좁혀진다", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText("스페이스 필터"), "ops");
    const allSection = screen.getByRole("heading", { name: "모든 스페이스" }).closest("section")!;
    expect(within(allSection).getByRole("button", { name: "운영 위키 (OPS)" })).toBeInTheDocument();
    expect(within(allSection).queryByRole("button", { name: "개발 위키 (DEV)" })).not.toBeInTheDocument();
  });

  it("필터에 일치하는 스페이스가 없으면 안내 문구를 보여준다", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText("스페이스 필터"), "존재하지않음");
    expect(screen.getByText("일치하는 스페이스가 없습니다")).toBeInTheDocument();
  });

  it("별표 토글 버튼은 aria-pressed로 상태를 드러내고 누르면 토글된다", async () => {
    const user = userEvent.setup();
    setup();
    const allSection = screen.getByRole("heading", { name: "모든 스페이스" }).closest("section")!;
    const star = within(allSection)
      .getAllByRole("button", { name: "별표" })
      .find((btn) => btn.closest(".space-flyout-item")?.textContent?.includes("운영 위키"))!;
    expect(star).toHaveAttribute("aria-pressed", "false");
    await user.click(star);
    expect(star).toHaveAttribute("aria-pressed", "true");
    // 별표를 누르면 '별표 표시됨' 섹션이 새로 생기고 그 항목이 나타난다
    const starredSection = screen.getByRole("heading", { name: "별표 표시됨" }).closest("section")!;
    expect(within(starredSection).getByRole("button", { name: "운영 위키 (OPS)" })).toBeInTheDocument();
  });

  it("항목의 이름 버튼을 클릭하면 onNavigate가 해당 spaceId로 호출된다", async () => {
    const user = userEvent.setup();
    const { onNavigate } = setup();
    const allSection = screen.getByRole("heading", { name: "모든 스페이스" }).closest("section")!;
    await user.click(within(allSection).getByRole("button", { name: "운영 위키 (OPS)" }));
    expect(onNavigate).toHaveBeenCalledWith("sp2");
  });

  it("'스페이스 만들기' 버튼을 클릭하면 onCreateClick이 호출된다", async () => {
    const user = userEvent.setup();
    const { onCreateClick } = setup();
    await user.click(screen.getByRole("button", { name: "스페이스 만들기" }));
    expect(onCreateClick).toHaveBeenCalledTimes(1);
  });

  // Escape/외부 클릭/Tab-out 닫기는 이 컴포넌트가 아니라 호출 측(WikiLayout)이 공용 훅
  // (useDismissablePopover.ts)으로 처리한다(W7 T1) — App.w6-spaces.test.tsx에서 통합 검증한다.

  // T3 잔여 픽스(a) — InsertMenu.tsx 관례(W6-T2 확정 패턴): 항목 이름/별표/만들기 버튼은
  // tabIndex={-1}로 탭 순서에서 뺀다. 그렇지 않으면 Tab으로 이 버튼들에 들어간 뒤 Escape를 눌러도
  // (필터 입력의 onKeyDown만 처리하므로) 안 먹는 갭이 생긴다.
  it("항목 이름/별표/만들기 버튼은 tabIndex={-1}로 탭 순서에서 제외된다", () => {
    setup();
    const allSection = screen.getByRole("heading", { name: "모든 스페이스" }).closest("section")!;
    const nameButton = within(allSection).getByRole("button", { name: "개발 위키 (DEV)" });
    expect(nameButton).toHaveAttribute("tabIndex", "-1");
    const starButton = within(allSection)
      .getAllByRole("button", { name: "별표" })
      .find((btn) => btn.closest(".space-flyout-item")?.textContent?.includes("개발 위키"))!;
    expect(starButton).toHaveAttribute("tabIndex", "-1");
    expect(screen.getByRole("button", { name: "스페이스 만들기" })).toHaveAttribute("tabIndex", "-1");
  });
});
