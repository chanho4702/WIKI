import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderApp } from "./testUtils";
import { __resetForTest, updatePage } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/**
 * 발췌 포함(W23). 한 문서의 요약을 여러 문서에 복사해 두면 하나를 고칠 때 나머지가 낡는다 —
 * 원본이 발췌를 표시하고 다른 문서가 끌어온다.
 */
describe("W23 발췌 포함", () => {
  it("다른 문서의 발췌 블록을 이 자리에 그린다", async () => {
    await updatePage("pg2", { body: "머리말\n\n:::excerpt\n팀 규칙 요약입니다\n:::\n\n본문" });
    await updatePage("pg1", { body: "# 시작\n\n::excerpt-include[팀 규칙]\n\n끝" });
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    const box = await screen.findByRole("complementary", { name: "팀 규칙 발췌" });
    expect(within(box).getByText("팀 규칙 요약입니다")).toBeInTheDocument();
    expect(within(box).queryByText("머리말")).not.toBeInTheDocument();
    expect(within(box).getByRole("link", { name: "팀 규칙" })).toBeInTheDocument();
  });

  /** 조용히 비어 있으면 왜 안 나오는지 모른다 — 발췌 블록이 없는 문서는 그 사실을 알린다. */
  it("발췌 블록이 없는 문서는 알린다", async () => {
    await updatePage("pg1", { body: "::excerpt-include[팀 규칙]" });
    renderApp("/spaces/sp1/pages/pg1");

    expect(await screen.findByText(/발췌 블록.*없습니다/)).toBeInTheDocument();
  });

  it("없는 문서는 알린다", async () => {
    await updatePage("pg1", { body: "::excerpt-include[없는 문서]" });
    renderApp("/spaces/sp1/pages/pg1");

    expect(await screen.findByText(/찾을 수 없습니다/)).toBeInTheDocument();
  });

  /** 서로를 포함하는 두 문서가 무한히 펼쳐지면 안 된다 — 한 단계만 따라간다. */
  it("발췌 안의 포함은 마커로만 남는다", async () => {
    await updatePage("pg2", { body: ":::excerpt\n::excerpt-include[시작하기]\n:::" });
    await updatePage("pg1", { body: ":::excerpt\n::excerpt-include[팀 규칙]\n:::" });
    renderApp("/spaces/sp1/pages/pg1");

    const outer = await screen.findByRole("complementary", { name: "팀 규칙 발췌" });
    expect(within(outer).getByText("::excerpt-include[시작하기]")).toBeInTheDocument();
    expect(within(outer).queryByRole("complementary")).not.toBeInTheDocument();
  });
});
