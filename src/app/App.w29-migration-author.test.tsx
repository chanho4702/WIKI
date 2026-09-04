import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/**
 * 원본 작성자 표시(W29 M3 §5.4).
 *
 * 이관된 문서의 `updatedBy`는 이관 담당자다. 그대로 두면 옮겨온 문서 전부가 그 한 사람이 쓴 것처럼
 * 보이므로, 서버가 원본 작성자를 우리 계정과 대조하지 못했을 때 원본 이름을 대신 보여준다.
 *
 * 이름 대조는 **메타 줄 안에서만** 한다 — 같은 사람이 댓글 작성자로도 나와, 문서 전체에서 찾으면
 * 무엇을 확인했는지 알 수 없는 단언이 된다.
 */
describe("W29 M3 이관 문서의 원본 작성자", () => {
  /** pg1에 서버가 채워 주는 두 필드를 얹는다 — 대조 실패한 이관 문서의 모양이다. */
  function seedImportedPage() {
    const seed = createSeedData();
    const page = seed.pages.find((p) => p.id === "pg1");
    if (!page) throw new Error("시드에 pg1이 없다");
    page.importedAuthorName = "김운영";
    page.importedSourceUrl = "https://wiki.example.com/pages/viewpage.action?pageId=10001";
    localStorage.setItem("wiki.v1", JSON.stringify(seed));
  }

  /** 메타 줄(작성자·수정일·조회수·소유자·검증 배지)만 떼어 낸다. */
  async function meta(): Promise<HTMLElement> {
    return await waitFor(() => {
      const found = document.querySelector<HTMLElement>(".page-view-meta");
      if (!found) throw new Error("메타 줄이 아직 없다");
      return found;
    });
  }

  it("대조하지 못한 이관 문서는 작성자 자리에 원본 이름과 원본 주소를 보여준다", async () => {
    seedImportedPage();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    const line = await meta();
    const imported = within(line).getByText(/이관됨 · 김운영/);
    // 원본으로 가는 길은 툴팁으로 붙는다 — 이름만으로는 누구인지 확인할 방법이 없다.
    expect(imported).toHaveAttribute(
      "title",
      "https://wiki.example.com/pages/viewpage.action?pageId=10001",
    );
    // 이관 담당자 이름이 작성자 자리에 남아 있으면 안 된다(시드 pg1의 updatedBy는 u2 = 이서연).
    expect(within(line).queryByText("이서연")).not.toBeInTheDocument();
  });

  it("이관 표시가 없는 보통 문서는 평소대로 우리 사용자 이름을 보여준다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    const line = await meta();
    expect(within(line).getByText("이서연")).toBeInTheDocument();
    expect(within(line).queryByText(/이관됨/)).not.toBeInTheDocument();
  });
});
