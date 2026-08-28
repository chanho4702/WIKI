import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import * as store from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

// 백엔드 모드 정합화(설계 §9): 실데이터에서 비는 필드/장애를 화면이 어떻게 다루는지.
describe("W8 백엔드 모드 정합화", () => {
  it("스페이스 로드가 실패하면(예: 권한 503) 빈 목록이 아니라 에러 화면 + 다시 시도를 보여준다", async () => {
    const user = userEvent.setup();
    // 첫 호출은 실패(장애), 다시 시도 시엔 정상 목록 — 조용히 빈 목록으로 삼키지 않아야 한다.
    vi.spyOn(store, "listSpaces")
      .mockRejectedValueOnce(new Error("권한 서비스에 연결할 수 없습니다"))
      .mockResolvedValueOnce([]);

    renderApp();

    expect(
      await screen.findByText(/스페이스를 불러올 수 없습니다: 권한 서비스에 연결할 수 없습니다/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    // 재시도 성공 → 에러 사라지고(빈 목록이면 EmptySpaces 흐름) 에러 문구는 없어진다
    await waitFor(() => {
      expect(screen.queryByText(/스페이스를 불러올 수 없습니다/)).not.toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });

  it("페이지 수정 시각/작성자가 비어 있어도(백엔드 모드) 'Invalid Date' 없이 메타를 숨긴다", async () => {
    // 백엔드 PageResponse엔 updatedAt/updatedBy가 없어 어댑터가 ""로 채운다 — 그 형태를 목업에 주입.
    const data = createSeedData();
    const pg = data.pages.find((p) => p.id === "pg1")!;
    pg.updatedAt = "";
    pg.updatedBy = "";
    localStorage.setItem("wiki.v1", JSON.stringify(data));

    renderApp("/spaces/sp1/pages/pg1");

    // 페이지 자체는 정상 렌더
    expect(await screen.findByRole("heading", { level: 1, name: "시작하기" })).toBeInTheDocument();
    // "Invalid Date" 노출 없음 — 작성자·수정일은 숨고, 조회수(항상 기록됨)만 남는다
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.queryByText(/수정$/)).not.toBeInTheDocument();
    expect(await screen.findByText(/^조회 \d+회$/)).toBeInTheDocument();
  });

  it("본문 VIEW가 막힌 ADMIN도 에러 화면에서 페이지 제한을 관리할 수 있다", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "getPage").mockRejectedValue(new Error("이 페이지를 볼 권한이 없습니다"));
    vi.spyOn(store, "getPageRestrictions").mockResolvedValue({
      view: [{ type: "user", id: "u1" }],
      edit: [],
      inherited: [],
    });

    renderApp("/spaces/sp1/pages/pg1");

    expect(await screen.findByText("이 페이지를 볼 권한이 없습니다")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "페이지 제한 관리" }));
    expect(await screen.findByRole("dialog", { name: "페이지 제한" })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
