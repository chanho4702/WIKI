import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W4 [[ 자동완성", () => {
  it("[[ 뒤 글자로 제목을 필터하고 Enter로 [[제목]]을 완성한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new");
    const body = await screen.findByLabelText("본문");
    // user-event v14는 "[[" 을 이스케이프(리터럴 "[" 하나)로 해석하므로 "[[[["로 두 번 이스케이프해야
    // 실제 "[["이 입력된다 — https://testing-library.com/docs/user-event/keyboard 의 이스케이프 규칙
    await user.type(body, "[[[[개");
    const listbox = await screen.findByRole("listbox", { name: "페이지 링크 자동완성" });
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "개발 환경 설정" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(body).toHaveValue("[[개발 환경 설정]]");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("화살표로 항목을 이동하고 Escape로 닫는다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new");
    const body = await screen.findByLabelText("본문");
    await user.type(body, "[[[["); // 전체 목록(최대 8) 표시 — "[[[["는 이스케이프되어 실제 "[["
    await screen.findByRole("listbox", { name: "페이지 링크 자동완성" });
    expect(screen.getByRole("option", { name: "시작하기" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    // listPages()는 position 필드로 정렬(부모/자식 구분 없이) — sp1 시드 데이터에서 시작하기(위치1) 다음은
    // "개발 환경 설정"(pg1의 자식, 위치1)이다. 목록 두 번째 항목이 하이라이트되는지만 검증한다.
    expect(screen.getByRole("option", { name: "개발 환경 설정" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(body).toHaveValue("[[");
  });

  it("클릭으로도 선택할 수 있다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new");
    const body = await screen.findByLabelText("본문");
    await user.type(body, "메모: [[[[팀");
    await user.click(await screen.findByRole("option", { name: "팀 규칙" }));
    expect(body).toHaveValue("메모: [[팀 규칙]]");
  });
});
