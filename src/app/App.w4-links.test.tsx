import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, updatePage } from "../features/wiki/store/wikiStore";
import { editorRegistry } from "../features/wiki/editor/editorTestRegistry";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  // 이전 테스트의 에디터 destroy가 setTimeout(0)으로 지연 발화될 수 있어, 그 사이 이 테스트가
  // "아직 안 지워진 이전 인스턴스"를 자기 것으로 착각하지 않도록 매 테스트 시작 전 명시적으로 비운다.
  editorRegistry.current = null;
});

describe("W4 [[제목]] 페이지 링크", () => {
  it("존재하는 제목은 페이지 링크로 렌더되고 클릭하면 이동한다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { body: "[[시작하기]] 문서를 참고하세요" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    const article = screen.getByRole("article"); // 사이드바 NavLink와 구분
    const link = within(article).getByRole("link", { name: "시작하기" });
    expect(link).toHaveAttribute("href", "/spaces/sp1/pages/pg1");
    expect(link).not.toHaveClass("wiki-link-missing");
    await user.click(link);
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
  });

  it("없는 제목은 danger 스타일 링크로 렌더되고 클릭하면 제목이 채워진 생성 화면으로 간다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { body: "[[운영 런북]]을 먼저 만들자" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    const article = screen.getByRole("article");
    const link = within(article).getByRole("link", { name: "운영 런북" });
    expect(link).toHaveClass("wiki-link-missing");
    await user.click(link);
    expect(await screen.findByPlaceholderText("제목 없음")).toHaveValue("운영 런북");
  });

  // W5: 미리보기 탭이 사라지면서 "편집 화면에서 링크 클릭 → 생성 화면 리마운트" 흐름 자체가
  // 없어졌다(칩은 원자 노드일 뿐 클릭 가능한 링크가 아니다). 대신 편집 화면(WikiEditor)에도
  // outlet의 실제 pages가 제대로 흘러들어가 부재 링크가 칩으로 구분되는지를 검증한다.
  it("편집 화면에서도 [[제목]]을 입력하면 부재 링크 칩으로 구분되어 보인다", async () => {
    renderApp("/spaces/sp1/pages/pg2/edit");
    expect(await screen.findByPlaceholderText("제목 없음")).toHaveValue("팀 규칙");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.commands.insertContentAt(0, {
      type: "wikiLink",
      attrs: { title: "운영 런북" },
    });
    const chip = await screen.findByText("운영 런북");
    expect(chip).toHaveClass("wiki-chip-missing");
    expect(editorRegistry.current!.storage.markdown.getMarkdown()).toContain("[[운영 런북]]");
  });
});
