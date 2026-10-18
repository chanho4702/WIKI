import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp } from "./testUtils";
import { __resetForTest, createPage } from "../features/wiki/store/wikiStore";

/*
 * 초안 정책(2026-10-18 사용자 결정) — 초안은 작성자(와 관리자)만 본다. 화면은 그 사실을 배지로 알린다.
 */

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("초안 — 나만 보임 표시", () => {
  it("내 초안을 보면 메타 줄에 '초안 — 나만 보임' 배지가 있다", async () => {
    const page = await createPage({ spaceId: "sp1", title: "작성 중 문서", body: "본문", status: "draft" });
    renderApp(`/spaces/sp1/pages/${page.id}`);

    expect(await screen.findByText("초안 — 나만 보임")).toBeInTheDocument();
  });

  it("초안 편집 화면에도 같은 배지가 있고 주 버튼은 '게시'다", async () => {
    const page = await createPage({ spaceId: "sp1", title: "작성 중 문서", body: "본문", status: "draft" });
    renderApp(`/spaces/sp1/pages/${page.id}/edit`);

    expect(await screen.findByRole("button", { name: "게시" })).toBeInTheDocument();
    expect(await screen.findByText("초안 — 나만 보임")).toBeInTheDocument();
  });

  it("게시된 문서에는 초안 배지가 없다", async () => {
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    expect(screen.queryByText(/^초안 — /)).not.toBeInTheDocument();
  });
});
