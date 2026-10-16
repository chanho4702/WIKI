import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, createPage } from "../features/wiki/store/wikiStore";
import { searchContent as mockSearchContent } from "../features/wiki/store/wikiMock";
import { ContentSearchError } from "../features/wiki/store/types";
import type { SearchHit } from "../features/wiki/store/types";

const searchMocks = vi.hoisted(() => ({ searchContent: vi.fn() }));

vi.mock("../features/wiki/store/wikiStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/wiki/store/wikiStore")>();
  return { ...actual, searchContent: searchMocks.searchContent };
});

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  searchMocks.searchContent.mockReset();
  searchMocks.searchContent.mockImplementation(mockSearchContent);
});

describe("W13 통합 검색", () => {
  it("헤더 검색을 Enter로 제출하면 URL q를 보존하고 제목·본문 결과를 보여준다", async () => {
    const user = userEvent.setup();
    renderApp("/home");

    const input = await screen.findByRole("searchbox", { name: "전역 검색" });
    await user.type(input, "개발 환경 설정{Enter}");

    expect(await screen.findByRole("heading", { level: 1, name: "검색" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/search\?q=/);
    expect(await screen.findByRole("link", { name: /개발 환경 설정/ })).toHaveAttribute(
      "href",
      "/spaces/sp1/pages/pg3",
    );
  });

  it("폴더 hit은 페이지 경로가 아니라 folder 경로로 이동한다", async () => {
    const folder = await createPage({ spaceId: "sp1", title: "운영 런북", type: "folder" });
    renderApp("/search?q=운영%20런북");

    expect(await screen.findByRole("link", { name: /운영 런북.*폴더/ })).toHaveAttribute(
      "href",
      `/spaces/sp1/folder/${folder.id}`,
    );
  });

  it("공백 검색어는 요청하지 않고 입력 안내를 보여준다", async () => {
    renderApp("/search?q=%20%20");

    expect(await screen.findByText("검색어를 입력하세요")).toBeInTheDocument();
    expect(searchMocks.searchContent).not.toHaveBeenCalled();
  });

  it("503과 429를 서로 다른 안내로 표시하고 다시 시도할 수 있다", async () => {
    const user = userEvent.setup();
    searchMocks.searchContent
      .mockRejectedValueOnce(
        new ContentSearchError("검색 서비스를 사용할 수 없습니다. 잠시 후 다시 시도하세요.", "unavailable"),
      )
      .mockRejectedValueOnce(
        new ContentSearchError("검색 요청이 너무 많습니다. 잠시 후 다시 시도하세요.", "rate-limited"),
      )
      .mockResolvedValueOnce({ total: 0, totalExact: true, tookMs: 0, hits: [] });
    renderApp("/search?q=검색");

    expect(await screen.findByText("검색 서비스를 사용할 수 없습니다. 잠시 후 다시 시도하세요.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("검색 요청이 너무 많습니다. 잠시 후 다시 시도하세요.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("검색 결과가 없습니다")).toBeInTheDocument();
  });

  /** 결과 한 쪽(20건)을 만든다 — 화면 PAGE_SIZE와 같다. */
  const hits = (count: number, prefix = "문서"): SearchHit[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `pg-${prefix}-${i}`,
      docType: "PAGE" as const,
      spaceId: "sp1",
      spaceKey: "ENG",
      spaceName: "개발",
      pageId: null,
      pageType: "PAGE" as const,
      title: `${prefix} ${i}`,
      filename: null,
      highlights: [],
      updatedAt: null,
      score: 1,
    }));

  it("정확하지 않은 합계는 하한으로 표시하고, 꽉 찬 쪽이면 다음 쪽을 열어 둔다", async () => {
    searchMocks.searchContent.mockResolvedValueOnce({
      total: 20,
      totalExact: false,
      tookMs: 4,
      hits: hits(20),
    });

    renderApp("/search?q=제한문서");

    expect(await screen.findByText("20개 이상")).toBeInTheDocument();
    expect(screen.getByText(/일부만 셌습니다/)).toBeInTheDocument();
    // total(하한)과 쪽 끝이 같아도 더 있을 수 있다 — 끝으로 단정하지 않는다.
    expect(screen.getByRole("button", { name: "다음" })).toBeEnabled();
  });

  it("정확한 합계면 마지막 쪽에서 다음을 막는다", async () => {
    searchMocks.searchContent.mockResolvedValueOnce({ total: 20, totalExact: true, tookMs: 1, hits: hits(20) });

    renderApp("/search?q=문서");

    expect(await screen.findByText("20개")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  it("정확하지 않은 0건은 결과가 없다고 단정하지 않는다", async () => {
    searchMocks.searchContent.mockResolvedValueOnce({ total: 0, totalExact: false, tookMs: 3, hits: [] });

    renderApp("/search?q=흔한말");

    expect(
      await screen.findByRole("heading", { name: "확인한 범위에서 볼 수 있는 결과를 찾지 못했습니다" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("검색 결과가 없습니다")).not.toBeInTheDocument();
  });

  it("끝 너머의 쪽은 빈 목록 대신 첫 페이지로 돌아갈 길을 준다", async () => {
    const user = userEvent.setup();
    searchMocks.searchContent
      .mockResolvedValueOnce({ total: 5, totalExact: true, tookMs: 1, hits: [] })
      .mockResolvedValueOnce({ total: 5, totalExact: true, tookMs: 1, hits: hits(5, "첫쪽") });

    renderApp("/search?q=문서&page=3");

    expect(await screen.findByRole("heading", { name: "이 페이지에는 결과가 없습니다" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "첫 페이지로" }));
    expect(await screen.findByRole("link", { name: /첫쪽 0/ })).toBeInTheDocument();
    expect(screen.getByTestId("location")).not.toHaveTextContent("page=");
  });
});
