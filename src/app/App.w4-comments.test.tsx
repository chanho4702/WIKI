import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, addComment } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openPg1Comments() {
  renderApp("/spaces/sp1/pages/pg1");
  await screen.findByRole("heading", { level: 1, name: "시작하기" });
  return screen.findByRole("region", { name: "코멘트" });
}

describe("W4 코멘트 답글/수정/삭제", () => {
  it("답글 버튼으로 답글을 달면 부모 아래 들여쓰기 영역에 보인다", async () => {
    const user = userEvent.setup();
    const region = await openPg1Comments();
    // 최상위 c1, c2 두 개 → 답글 버튼도 2개 (답글에는 없음)
    await user.click(within(region).getAllByRole("button", { name: "답글" })[0]);
    await user.type(within(region).getByLabelText("답글 작성"), "동의합니다");
    await user.click(within(region).getByRole("button", { name: "답글 남기기" }));
    const replies = await within(region).findAllByTestId("comment-replies");
    expect(within(replies[0]).getByText("동의합니다")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (3)" })).toBeInTheDocument();
    // 답글에는 답글 버튼이 생기지 않는다 (여전히 최상위 2개뿐)
    expect(within(region).getAllByRole("button", { name: "답글" })).toHaveLength(2);
  });

  it("본인 코멘트만 수정/삭제 버튼이 보이고, 수정하면 (수정됨)이 붙는다", async () => {
    const user = userEvent.setup();
    await addComment("pg1", "내가 쓴 코멘트"); // 현재 유저 u1
    const region = await openPg1Comments();
    // 시드 c1(u2)·c2(u3)에는 수정/삭제가 없다 — 내 코멘트 1개에만
    expect(within(region).getAllByRole("button", { name: "수정" })).toHaveLength(1);
    expect(within(region).getAllByRole("button", { name: "삭제" })).toHaveLength(1);
    await user.click(within(region).getByRole("button", { name: "수정" }));
    const editor = within(region).getByLabelText("코멘트 수정");
    expect(editor).toHaveValue("내가 쓴 코멘트");
    await user.clear(editor);
    await user.type(editor, "고친 코멘트");
    await user.click(within(region).getByRole("button", { name: "저장" }));
    expect(await within(region).findByText("고친 코멘트")).toBeInTheDocument();
    expect(within(region).getByText(/\(수정됨\)/)).toBeInTheDocument();
  });

  it("삭제는 확인 후 진행되고 목록에서 사라진다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await addComment("pg1", "지울 코멘트");
    const region = await openPg1Comments();
    await user.click(within(region).getByRole("button", { name: "삭제" }));
    expect(window.confirm).toHaveBeenCalled();
    await within(region).findByRole("heading", { name: "코멘트 (2)" });
    expect(within(region).queryByText("지울 코멘트")).not.toBeInTheDocument();
  });

  it("confirm을 취소하면 삭제하지 않는다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await addComment("pg1", "남을 코멘트");
    const region = await openPg1Comments();
    await user.click(within(region).getByRole("button", { name: "삭제" }));
    expect(within(region).getByText("남을 코멘트")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (3)" })).toBeInTheDocument();
  });
});
