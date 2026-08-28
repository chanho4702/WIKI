import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, createPage } from "../features/wiki/store/wikiStore";
import { searchContent as mockSearchContent } from "../features/wiki/store/wikiMock";
import { ContentSearchError } from "../features/wiki/store/types";

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

  it("권한 후필터가 전체를 스캔하지 못한 합계는 정확한 개수처럼 표시하지 않는다", async () => {
    searchMocks.searchContent.mockResolvedValueOnce({
      total: 21,
      totalExact: false,
      tookMs: 4,
      hits: [],
    });

    renderApp("/search?q=제한문서");

    expect(await screen.findByText("21개 이상")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음" })).toBeEnabled();
  });
});
