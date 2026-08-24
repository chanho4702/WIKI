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
    await user.selectOptions(within(viewSection).getByLabelText("보기 제한 주체 추가"), "user:u2");
    await user.selectOptions(within(viewSection).getByLabelText("보기 제한 주체 추가"), "team:t1");
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
