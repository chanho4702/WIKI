import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";
import type { WikiData } from "../features/wiki/store/types";

/**
 * Markdown 가져오기 · Word 내보내기(2026-11-07).
 *
 * - 문서 "…" → "Markdown 가져오기…"는 그 문서 아래에, 헤더 "만들기" → "Markdown 가져오기…"는 스페이스 최상위에
 *   파일마다 새 문서를 만들고 첫 문서로 간다.
 * - 거부(확장자 등)는 대화상자 안에 남는다 — 아무 문서도 만들지 않았으니 다시 고르게 한다.
 * - Word는 서버 렌더러가 만든다 — 목업 모드에는 Word 메뉴가 없다.
 */

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/** 목업 저장소의 문서 전량(초안·상태까지 보려고 트리 API가 아니라 저장소를 읽는다). */
function storedPages(): WikiData["pages"] {
  return (JSON.parse(localStorage.getItem("wiki.v1") ?? "{}") as WikiData).pages;
}

function md(name: string, body: string) {
  return new File([body], name, { type: "text/markdown" });
}

describe("Markdown 가져오기", () => {
  it("문서 … 메뉴에서 가져오면 그 문서 아래에 만들고 첫 문서로 간다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "Markdown 가져오기…" }));
    const dialog = await screen.findByRole("dialog", { name: "Markdown 가져오기" });
    expect(dialog).toHaveTextContent('"팀 규칙" 아래에');

    await user.upload(within(dialog).getByLabelText("가져올 Markdown 파일 선택"), [
      md("회의록.md", "# 주간 회의록\n\n- 결정 사항"),
      md("메모.md", "메모 본문"),
    ]);
    expect(within(dialog).getByRole("list", { name: "선택한 파일" })).toHaveTextContent("회의록.md");
    await user.click(within(dialog).getByRole("button", { name: "가져오기" }));

    expect(await screen.findByRole("heading", { level: 1, name: "주간 회의록" })).toBeInTheDocument();
    expect(await screen.findByText("문서 2개를 가져왔습니다")).toBeInTheDocument();
    const imported = storedPages().filter((p) => p.parentId === "pg2");
    expect(imported.map((p) => p.title)).toEqual(["주간 회의록", "메모"]);
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(`/spaces/sp1/pages/${imported[0].id}`);
    });
  });

  it("헤더 만들기에서 가져오면 스페이스 최상위에 초안으로도 만들 수 있다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    await user.click(screen.getByRole("button", { name: "만들기" }));
    await user.click(await screen.findByRole("menuitem", { name: "Markdown 가져오기…" }));
    const dialog = await screen.findByRole("dialog", { name: "Markdown 가져오기" });
    expect(dialog).toHaveTextContent("스페이스 최상위에");

    await user.upload(within(dialog).getByLabelText("가져올 Markdown 파일 선택"), md("초안.md", "# 내 초안\n본문"));
    await user.click(within(dialog).getByRole("checkbox", { name: /초안으로 가져오기/ }));
    await user.click(within(dialog).getByRole("button", { name: "가져오기" }));

    expect(await screen.findByRole("heading", { level: 1, name: "내 초안" })).toBeInTheDocument();
    const page = storedPages().find((p) => p.title === "내 초안");
    expect(page).toMatchObject({ parentId: null, status: "draft" });
  });

  it("Markdown이 아닌 파일은 대화상자 안에서 거부하고 가져오기를 막는다", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    const before = storedPages().length;

    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "Markdown 가져오기…" }));
    const dialog = await screen.findByRole("dialog", { name: "Markdown 가져오기" });
    await user.upload(
      within(dialog).getByLabelText("가져올 Markdown 파일 선택"),
      new File(["x"], "사진.png", { type: "image/png" }),
    );

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Markdown 파일(.md, .markdown)만 가져올 수 있습니다: 사진.png");
    expect(within(dialog).getByRole("button", { name: "가져오기" })).toBeDisabled();
    expect(storedPages()).toHaveLength(before);
  });
});

describe("zip 가져오기(목업)", () => {
  it("zip은 서버가 풀기 때문에 목업 모드 대화상자는 zip을 받지 않는다", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "Markdown 가져오기…" }));
    const dialog = await screen.findByRole("dialog", { name: "Markdown 가져오기" });
    expect(dialog).toHaveTextContent("상대 경로 이미지는 가져오지 않습니다");
    await user.upload(
      within(dialog).getByLabelText("가져올 Markdown 파일 선택"),
      new File(["PK"], "docs.zip", { type: "application/zip" }),
    );

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Markdown 파일(.md, .markdown)만 가져올 수 있습니다: docs.zip");
    expect(within(dialog).getByRole("button", { name: "가져오기" })).toBeDisabled();
  });
});

describe("Word 내보내기", () => {
  it("목업 모드에는 Word 메뉴가 없다(서버 렌더)", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await screen.findByRole("menuitem", { name: "내보내기" });
    expect(screen.queryByRole("menuitem", { name: "Word로 내보내기" })).not.toBeInTheDocument();
  });
});
