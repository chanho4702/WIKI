import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, getPage } from "../features/wiki/store/wikiStore";
import { editorRegistry } from "../features/wiki/editor/editorTestRegistry";

/*
 * W-17 — 편집 중 앱 안 이동(사이드바 트리 클릭 등)이 미저장 편집을 조용히 버리던 결함.
 * beforeunload는 새로고침·탭 닫기만 막는다. 라우터 이동은 데이터 라우터의 useBlocker가 막는다.
 */

const tree = () => within(screen.getByRole("navigation", { name: "페이지 트리" }));
const location = () => screen.getByTestId("location");

async function openEditor() {
  renderApp("/spaces/sp1/pages/pg2/edit");
  await waitFor(() => expect(editorRegistry.current).toBeTruthy());
  return screen.getByPlaceholderText("제목 없음");
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  editorRegistry.current = null;
});

describe("W-17 편집 화면 앱 안 이탈 가드", () => {
  it("제목을 고친 채 트리의 다른 문서를 누르면 확인을 묻고, 계속 편집하면 그 자리에 편집이 남는다", async () => {
    const user = userEvent.setup();
    const title = await openEditor();
    await user.clear(title);
    await user.type(title, "팀 규칙 고침");

    await user.click(await tree().findByRole("link", { name: "시작하기" }));

    const dialog = await screen.findByRole("dialog", { name: "저장하지 않은 변경이 있습니다" });
    expect(location()).toHaveTextContent("/spaces/sp1/pages/pg2/edit");
    await user.click(within(dialog).getByRole("button", { name: "계속 편집" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(location()).toHaveTextContent("/spaces/sp1/pages/pg2/edit");
    expect(screen.getByPlaceholderText("제목 없음")).toHaveValue("팀 규칙 고침");
  });

  it("본문만 고쳐도 묻고, 나가기를 고르면 저장하지 않고 이동한다", async () => {
    const user = userEvent.setup();
    await openEditor();
    editorRegistry.current!.commands.setContent("## 바뀐 본문", true);

    await user.click(await tree().findByRole("link", { name: "시작하기" }));
    const dialog = await screen.findByRole("dialog", { name: "저장하지 않은 변경이 있습니다" });
    await user.click(within(dialog).getByRole("button", { name: "나가기" }));

    await waitFor(() => expect(location()).toHaveTextContent(/\/spaces\/sp1\/pages\/pg1$/));
    expect((await getPage("pg2"))!.body).not.toContain("바뀐 본문");
  });

  it("고친 것이 없으면 묻지 않고 바로 이동한다", async () => {
    const user = userEvent.setup();
    await openEditor();

    await user.click(await tree().findByRole("link", { name: "시작하기" }));

    await waitFor(() => expect(location()).toHaveTextContent(/\/spaces\/sp1\/pages\/pg1$/));
    expect(screen.queryByRole("dialog", { name: "저장하지 않은 변경이 있습니다" })).not.toBeInTheDocument();
  });

  it("저장한 뒤의 이동은 묻지 않는다", async () => {
    const user = userEvent.setup();
    const title = await openEditor();
    await user.clear(title);
    await user.type(title, "팀 규칙 저장");

    await user.click(screen.getByRole("button", { name: "업데이트" }));

    await waitFor(() => expect(location()).toHaveTextContent(/\/spaces\/sp1\/pages\/pg2$/));
    expect(screen.queryByRole("dialog", { name: "저장하지 않은 변경이 있습니다" })).not.toBeInTheDocument();
    expect((await getPage("pg2"))!.title).toBe("팀 규칙 저장");
  });
});
