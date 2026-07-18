import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

/** 시드(sp1 하나)에 두 번째 스페이스(sp2)를 더해 localStorage에 직접 심는다 — 스위처/필터/이동을
 * 검증하려면 최소 2개 스페이스가 필요하다. */
function seedTwoSpaces() {
  const data = createSeedData();
  data.spaces.push({ id: "sp2", key: "OPS", name: "운영 위키", createdAt: "2026-07-11T00:00:00.000Z" });
  data.pages.push({
    id: "pg9",
    spaceId: "sp2",
    parentId: null,
    title: "운영 시작하기",
    body: "# 운영 위키",
    position: 1,
    createdBy: "u1",
    updatedBy: "u1",
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
  });
  localStorage.setItem("wiki.v1", JSON.stringify(data));
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  seedTwoSpaces();
});

describe("W6 스페이스 플라이아웃", () => {
  it("트리거를 열고 필터한 뒤 항목을 클릭하면 해당 스페이스로 이동하고 패널이 닫힌다", async () => {
    const user = userEvent.setup();
    renderApp();
    const trigger = await screen.findByRole("button", { name: "스페이스 전환: 개발 위키" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByPlaceholderText("스페이스 필터")).toHaveFocus();

    await user.type(screen.getByPlaceholderText("스페이스 필터"), "ops");
    await user.click(screen.getByRole("button", { name: "운영 위키 (OPS)" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp2");
    });
    // 패널이 닫혔다 — 필터 입력/다이얼로그가 더 이상 없다
    expect(screen.queryByPlaceholderText("스페이스 필터")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "스페이스 전환" })).not.toBeInTheDocument();
    // 트리거도 새 스페이스로 바뀐다
    expect(await screen.findByRole("button", { name: "스페이스 전환: 운영 위키" })).toBeInTheDocument();
  });

  it("별표를 누르면 '별표 표시됨' 섹션으로 옮겨가고, 현재 스페이스는 그 섹션에서 제외된다", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "스페이스 전환: 개발 위키" }));
    expect(screen.queryByRole("heading", { name: "별표 표시됨" })).not.toBeInTheDocument();

    // 아직 별표가 없으므로 "운영 위키 (OPS)" 이름 버튼은 화면에 하나뿐이다(모든 스페이스 섹션).
    const opsItem = screen
      .getByRole("button", { name: "운영 위키 (OPS)" })
      .closest(".space-flyout-item") as HTMLElement;
    await user.click(within(opsItem).getByRole("button", { name: "별표" }));

    const starredSection = screen.getByRole("heading", { name: "별표 표시됨" }).closest("section")!;
    expect(within(starredSection).getByRole("button", { name: "운영 위키 (OPS)" })).toBeInTheDocument();
    // 현재 스페이스(개발 위키)를 별표해도 '별표 표시됨'에는 나타나지 않는다(현재 섹션에서 이미 보임)
    const currentItem = screen
      .getAllByRole("button", { name: "개발 위키 (DEV)" })
      .map((btn) => btn.closest(".space-flyout-item"))
      .find((el): el is HTMLElement => el !== null)!;
    await user.click(within(currentItem).getByRole("button", { name: "별표" }));
    expect(
      within(starredSection).queryByRole("button", { name: "개발 위키 (DEV)" }),
    ).not.toBeInTheDocument();
  });

  it("Escape로 닫으면 트리거 버튼으로 포커스가 돌아간다", async () => {
    const user = userEvent.setup();
    renderApp();
    const trigger = await screen.findByRole("button", { name: "스페이스 전환: 개발 위키" });
    await user.click(trigger);
    await screen.findByPlaceholderText("스페이스 필터");

    await user.keyboard("{Escape}");

    expect(screen.queryByPlaceholderText("스페이스 필터")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  // InsertMenu.tsx 확정 패턴: 외부 클릭은 닫기만 하고 포커스를 강탈하지 않는다.
  it("패널 바깥을 클릭하면 닫히지만 포커스를 빼앗지 않는다", async () => {
    const user = userEvent.setup();
    renderApp();
    const trigger = await screen.findByRole("button", { name: "스페이스 전환: 개발 위키" });
    await user.click(trigger);
    await screen.findByPlaceholderText("스페이스 필터");

    const treeNav = screen.getByRole("navigation", { name: "페이지 트리" });
    await user.click(treeNav);

    expect(screen.queryByPlaceholderText("스페이스 필터")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveFocus();
  });

  it("트리거를 다시 클릭하면(외부 클릭 핸들러와 경합 없이) 닫힌다", async () => {
    const user = userEvent.setup();
    renderApp();
    const trigger = await screen.findByRole("button", { name: "스페이스 전환: 개발 위키" });
    await user.click(trigger);
    await screen.findByPlaceholderText("스페이스 필터");

    await user.click(trigger);

    expect(screen.queryByPlaceholderText("스페이스 필터")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  // W7 T1 — 트리거 aria-label 보강(name으로 찾는 App.w6-spaces 테스트가 "이름 (KEY)" 텍스트가
  // 아니라 "스페이스 전환: {이름}"으로 트리거를 식별하도록 확정한다).
  it("트리거의 접근 가능한 이름은 '스페이스 전환: {현재 이름}'이다", async () => {
    renderApp();
    const trigger = await screen.findByRole("button", { name: "스페이스 전환: 개발 위키" });
    expect(trigger).toHaveAttribute("aria-label", "스페이스 전환: 개발 위키");
  });

  // W7 T1 — Tab-out 갭: 필터 입력에서 Tab으로 컨테이너 밖으로 나가면(포커스 강탈 없이) 패널이
  // 닫혀야 한다.
  it("필터 입력에서 Tab으로 컨테이너 밖으로 나가면(Tab-out) 포커스를 빼앗지 않고 패널만 닫힌다", async () => {
    const user = userEvent.setup();
    renderApp();
    const trigger = await screen.findByRole("button", { name: "스페이스 전환: 개발 위키" });
    await user.click(trigger);
    const filter = await screen.findByPlaceholderText("스페이스 필터");
    const closeSidebarButton = screen.getByRole("button", { name: "사이드바 접기" });

    fireEvent.focusOut(filter, { relatedTarget: closeSidebarButton });

    expect(screen.queryByPlaceholderText("스페이스 필터")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveFocus();
  });

  // W7 T1 — Escape 승격 갭(리뷰 근거): 이전엔 Escape가 필터 input의 onKeyDown에만 바인딩돼 있어,
  // 별표 버튼처럼 다른 요소에 포커스가 가 있으면 Escape가 먹지 않았다. 이제 컨테이너 전체
  // keydown이라 별표 버튼에서 눌러도 동작해야 한다.
  it("별표 버튼에 포커스가 가 있어도 Escape를 누르면 닫히고 트리거로 포커스가 되돌아간다", async () => {
    const user = userEvent.setup();
    renderApp();
    const trigger = await screen.findByRole("button", { name: "스페이스 전환: 개발 위키" });
    await user.click(trigger);
    await screen.findByPlaceholderText("스페이스 필터");

    const opsItem = screen
      .getByRole("button", { name: "운영 위키 (OPS)" })
      .closest(".space-flyout-item") as HTMLElement;
    const star = within(opsItem).getByRole("button", { name: "별표" });
    star.focus();

    await user.keyboard("{Escape}");

    expect(screen.queryByPlaceholderText("스페이스 필터")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
