import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * DS Select·MultiSelect 고르기 — 생 `<select>`의 `user.selectOptions`를 대신한다.
 * 트리거(combobox)를 열고 옵션을 접근 이름으로 누른다. 목록은 팝오버라 문서 전체(screen)에서 찾는다.
 */
export async function chooseOption(user: UserEvent, combobox: HTMLElement, name: string | RegExp): Promise<void> {
  await user.click(combobox);
  await user.click(await screen.findByRole("option", { name }));
}

/** 열린 목록의 옵션 이름 — 트리거를 열고 읽은 뒤 Escape로 닫는다. */
export async function optionNames(user: UserEvent, combobox: HTMLElement): Promise<string[]> {
  await user.click(combobox);
  const listbox = await screen.findByRole("listbox");
  const names = within(listbox)
    .getAllByRole("option")
    .map((o) => o.textContent?.trim() ?? "");
  await user.keyboard("{Escape}");
  return names;
}
