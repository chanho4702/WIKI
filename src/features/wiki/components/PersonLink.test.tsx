import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { PersonProfile } from "../store/types";
import { PersonLink } from "./PersonLink";

const profiles: Record<string, PersonProfile> = {
  "7": { id: "7", name: "정하늘", email: "7@example.com", status: "ACTIVE", teams: [] },
  "8": { id: "8", name: "박준영", email: "8@example.com", status: "ACTIVE", teams: [] },
};

let pending: Record<string, (profile: PersonProfile | null) => void> = {};

vi.mock("../store/wikiStore", () => ({
  getPersonProfile: (id: string) =>
    new Promise<PersonProfile | null>((resolve) => {
      pending[id] = resolve;
    }),
}));

function view(userId: string) {
  return (
    <MemoryRouter>
      <PersonLink userId={userId}>작성자</PersonLink>
    </MemoryRouter>
  );
}

describe("PersonLink", () => {
  it("같은 자리의 링크가 다른 사람으로 바뀌면 이전 사람의 카드를 버리고 새 사람을 다시 묻는다", async () => {
    pending = {};
    const { rerender } = render(view("7"));
    act(() => screen.getByRole("link", { name: "작성자" }).focus());
    await act(async () => pending["7"](profiles["7"]));
    expect(screen.getByRole("dialog", { name: "정하늘 프로필 카드" })).toBeInTheDocument();

    rerender(view("8"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => screen.getByRole("link", { name: "작성자" }).blur());
    act(() => screen.getByRole("link", { name: "작성자" }).focus());
    await act(async () => pending["8"](profiles["8"]));
    expect(screen.getByRole("dialog", { name: "박준영 프로필 카드" })).toBeInTheDocument();
    expect(screen.queryByText("7@example.com")).not.toBeInTheDocument();
  });

  it("요청이 진행 중일 때 사람이 바뀌어도 늦게 온 이전 응답을 쓰지 않는다", async () => {
    pending = {};
    const { rerender } = render(view("7"));
    act(() => screen.getByRole("link", { name: "작성자" }).focus());
    rerender(view("8"));
    await act(async () => pending["7"](profiles["7"]));
    act(() => screen.getByRole("link", { name: "작성자" }).blur());
    act(() => screen.getByRole("link", { name: "작성자" }).focus());
    await act(async () => pending["8"](profiles["8"]));
    expect(screen.getByRole("dialog", { name: "박준영 프로필 카드" })).toBeInTheDocument();
    expect(screen.queryByText("정하늘")).not.toBeInTheDocument();
  });
});
