import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W3 코멘트", () => {
  it("시드 코멘트 2개가 오름차순으로 보이고, 작성하면 목록 끝에 반영된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    const region = await screen.findByRole("region", { name: "코멘트" });
    expect(within(region).getByRole("heading", { name: "코멘트 (2)" })).toBeInTheDocument();
    // 오름차순: c1(이서연, 11:00) → c2(박준영, 11:30)
    expect(
      within(region).getAllByTestId("comment-body").map((el) => el.textContent),
    ).toEqual(["온보딩에 딱 필요한 내용이네요.", "배포 가이드 링크도 추가하면 좋겠습니다."]);
    expect(within(region).getByText("이서연")).toBeInTheDocument();
    expect(within(region).getByText("박준영")).toBeInTheDocument();
    // 작성 → 목록 끝에 추가 (현재 유저 u1 김찬호)
    await user.type(within(region).getByLabelText("코멘트 작성"), "복원 기능도 확인했습니다");
    await user.click(within(region).getByRole("button", { name: "코멘트 남기기" }));
    expect(await within(region).findByText("복원 기능도 확인했습니다")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (3)" })).toBeInTheDocument();
    expect(
      within(region).getAllByTestId("comment-body").map((el) => el.textContent),
    ).toEqual([
      "온보딩에 딱 필요한 내용이네요.",
      "배포 가이드 링크도 추가하면 좋겠습니다.",
      "복원 기능도 확인했습니다",
    ]);
    expect(within(region).getByText("김찬호")).toBeInTheDocument();
    // 입력창은 비워진다
    expect(within(region).getByLabelText("코멘트 작성")).toHaveValue("");
  });

  it("빈 코멘트를 제출하면 danger Toast가 뜨고 목록은 그대로다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    const region = await screen.findByRole("region", { name: "코멘트" });
    await user.click(within(region).getByRole("button", { name: "코멘트 남기기" }));
    expect(await screen.findByText("코멘트 작성 실패")).toBeInTheDocument();
    expect(screen.getByText("코멘트 내용을 입력하세요")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (2)" })).toBeInTheDocument();
    expect(within(region).getAllByTestId("comment-body")).toHaveLength(2);
  });
});
