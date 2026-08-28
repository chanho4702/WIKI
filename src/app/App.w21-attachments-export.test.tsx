import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

describe("W21-3 첨부파일 화면", () => {
  it("첨부가 없으면 빈 상태와 첨부 버튼을 보여준다", async () => {
    renderApp("/spaces/sp1/pages/pg1");

    const section = await screen.findByRole("region", { name: "첨부파일" });
    expect(within(section).getByText("첨부된 파일이 없습니다.")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "파일 첨부" })).toBeInTheDocument();
  });
});

describe("W21-3 내보내기", () => {
  it("더 보기에서 내보내기를 열면 대상 문서 수를 알려준다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");

    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: /내보내기/ }));

    expect(await screen.findByText("문서 1개를 내보냅니다.")).toBeInTheDocument();

    // pg1 > pg3 > pg5, pg1 > pg4 — 하위 포함이면 4개
    await user.click(screen.getByRole("checkbox", { name: "하위 문서 포함" }));
    expect(await screen.findByText("문서 4개를 내보냅니다.")).toBeInTheDocument();
  });

  it("Markdown을 고르면 파일 내려받기를 실행한다", async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    // jsdom에는 Blob URL 구현이 아예 없어(spyOn 불가) 함수를 직접 심는다 — 다운로드 경로만 확인한다
    const createUrl = vi.fn(() => "blob:mock");
    Object.defineProperty(URL, "createObjectURL", { value: createUrl, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    renderApp("/spaces/sp1/pages/pg1");

    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: /내보내기/ }));
    await user.click(await screen.findByRole("button", { name: "Markdown" }));

    expect(createUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
