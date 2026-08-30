import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, listTeamMembers, listTeams } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/** 팀 관리(W23). 스페이스 권한 부여에 팀을 쓸 수 있었는데 정작 팀을 만들 화면이 없었다. */
describe("W23 팀 관리", () => {
  it("팀을 만들고 사람을 넣고 뺀다", async () => {
    const user = userEvent.setup();
    renderApp("/admin/teams");
    await screen.findByRole("heading", { name: "팀 관리" });

    await user.type(screen.getByLabelText("새 팀 이름"), "운영팀");
    await user.click(screen.getByRole("button", { name: "팀 만들기" }));
    const created = (await listTeams()).find((t) => t.name === "운영팀");
    expect(created).toBeDefined();

    // 만든 팀이 선택된 상태 — 상세 제목이 그 팀이다
    expect(await screen.findByRole("heading", { level: 2, name: "운영팀" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("팀원 추가"), "u2");
    await user.click(screen.getByRole("button", { name: "추가" }));
    const members = await screen.findByRole("list", { name: "팀원" });
    expect(within(members).getAllByRole("listitem")).toHaveLength(1);
    expect((await listTeamMembers(created!.id)).map((m) => m.memberId)).toEqual(["u2"]);

    await user.click(within(members).getByRole("button", { name: /제외/ }));
    expect(await screen.findByRole("heading", { name: "팀원이 없습니다" })).toBeInTheDocument();
  });

  it("같은 이름의 팀은 거부한다", async () => {
    const user = userEvent.setup();
    renderApp("/admin/teams");
    await screen.findByRole("heading", { name: "팀 관리" });

    await user.type(screen.getByLabelText("새 팀 이름"), "플랫폼팀");
    await user.click(screen.getByRole("button", { name: "팀 만들기" }));

    expect(await screen.findByText(/이미 존재하는 팀 이름/)).toBeInTheDocument();
  });
});
