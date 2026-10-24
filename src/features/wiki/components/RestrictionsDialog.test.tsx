import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@chanho/react";
import { RestrictionsDialog } from "./RestrictionsDialog";
import { __resetForTest, getPageRestrictions, setPageRestrictions } from "../store/wikiStore";
import { MOCK_USERS } from "../../../mock/users";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

function renderDialog(onSaved = vi.fn()) {
  render(
    <ToastProvider>
      <RestrictionsDialog
        open
        onOpenChange={() => {}}
        pageId="pg1"
        users={MOCK_USERS}
        onSaved={onSaved}
      />
    </ToastProvider>,
  );
  return onSaved;
}

describe("RestrictionsDialog — 자물쇠 다이얼로그", () => {
  it("주체를 추가해 저장하면 전체 교체로 반영된다", async () => {
    const user = userEvent.setup();
    const onSaved = renderDialog();

    const viewSection = await screen.findByRole("region", { name: "보기 제한" });
    // 여러 개 고르는 목록(MultiSelect) — 고르는 동안 열려 있고, Escape로 닫아도 대화상자는 남는다
    await user.click(within(viewSection).getByRole("combobox", { name: "보기 제한 주체" }));
    await user.click(await screen.findByRole("option", { name: "이서연" }));
    await user.click(screen.getByRole("option", { name: "플랫폼팀" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "페이지 제한" })).toBeInTheDocument();
    // 고른 주체는 목록에 들어가 ✕로 지울 수 있다
    expect(within(viewSection).getByRole("button", { name: "플랫폼팀 제거" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await getPageRestrictions("pg1");
    expect(saved.view).toEqual([
      { type: "user", id: "u2" },
      { type: "team", id: "t1" },
    ]);
    expect(saved.edit).toEqual([]);
  });

  it("기존 제한이 이름으로 보이고 제거할 수 있다", async () => {
    await setPageRestrictions("pg1", { view: [{ type: "user", id: "u2" }], edit: [] });
    const user = userEvent.setup();
    const onSaved = renderDialog();

    const viewSection = await screen.findByRole("region", { name: "보기 제한" });
    const name = MOCK_USERS.find((u) => u.id === "u2")!.name;
    // 이름은 칩과 선택 옵션 양쪽에 있다 — 유일한 제거 버튼(접근 이름)으로 칩 존재를 확인
    const removeBtn = within(viewSection).getByRole("button", { name: `${name} 제거` });
    expect(removeBtn).toBeInTheDocument();

    await user.click(removeBtn);
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect((await getPageRestrictions("pg1")).view).toEqual([]);
  });

  it("선택지에 없는 주체는 다른 주체를 고르거나 빼도 조용히 지워지지 않는다", async () => {
    await setPageRestrictions("pg1", { view: [{ type: "user", id: "gone" }], edit: [] });
    const user = userEvent.setup();
    const onSaved = renderDialog();

    const viewSection = await screen.findByRole("region", { name: "보기 제한" });
    await user.click(within(viewSection).getByRole("combobox", { name: "보기 제한 주체" }));
    await user.click(await screen.findByRole("option", { name: "이서연" }));
    await user.click(screen.getByRole("option", { name: "이서연" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect((await getPageRestrictions("pg1")).view).toEqual([{ type: "user", id: "gone" }]);
  });

  it("조상의 보기 제한이 상속 안내로 표시된다", async () => {
    await setPageRestrictions("pg1", { view: [{ type: "user", id: "u2" }], edit: [] });
    render(
      <ToastProvider>
        <RestrictionsDialog open onOpenChange={() => {}} pageId="pg5" users={MOCK_USERS} />
      </ToastProvider>,
    );
    expect(await screen.findByText(/상위 “시작하기”에서 상속/)).toBeInTheDocument();
  });
});
