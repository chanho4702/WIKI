import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import * as mockStore from "../features/wiki/store/wikiMock";
import { __resetForTest, listVersions } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

/**
 * 페이지 히스토리 — 컨플루언스식 전용 화면 셋(W30).
 *
 * 모달을 걷어내고 표·이전 버전 보기·비교 화면으로 나눴다. 여기서 고정하는 것은 그 화면들이
 * 서로 이어지는 방식이다 — 2개 제한 선택 → 비교, 배너에서 현재 버전과 비교, 복원 확인.
 */
const storeMocks = vi.hoisted(() => ({ listVersions: vi.fn() }));

vi.mock("../features/wiki/store/wikiStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/wiki/store/wikiStore")>();
  return { ...actual, listVersions: storeMocks.listVersions };
});

/** 목업 사용자 디렉터리에 없는 저장자 — 이름 폴백(스냅샷 / `사용자 #{id}`)을 만든다. */
function seedWithUnknownAuthors() {
  const seed = createSeedData();
  seed.versions.push(
    {
      id: "pv-x2",
      pageId: "pg2",
      version: 2,
      title: "팀 규칙",
      body: "고침",
      savedBy: "u404",
      savedByName: "퇴사한 사람",
      savedAt: "2026-08-01T01:02:03.000Z",
      changeNote: "표 정리",
    },
    {
      id: "pv-x3",
      pageId: "pg2",
      version: 3,
      title: "팀 규칙",
      body: "또 고침",
      savedBy: "u405",
      savedAt: "2026-08-02T01:02:03.000Z",
    },
  );
  localStorage.setItem("wiki.v1", JSON.stringify(seed));
  __resetForTest();
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  storeMocks.listVersions.mockReset();
  storeMocks.listVersions.mockImplementation(mockStore.listVersions);
});

describe("W30 히스토리 표", () => {
  it("최신순 행에 버전·저장자·절대시각·변경 요약이 있고 최신 행에만 '현재' 배지가 붙는다", async () => {
    seedWithUnknownAuthors();
    renderApp("/spaces/sp1/pages/pg2/history");
    await screen.findByRole("heading", { level: 1, name: "페이지 히스토리" });

    const rows = screen.getAllByRole("row").slice(1); // 헤더 제외
    expect(rows).toHaveLength(3);
    // 최신(v. 3) → v. 2 → v. 1
    expect(within(rows[0]).getByRole("link", { name: "v. 3" })).toBeInTheDocument();
    expect(within(rows[2]).getByRole("link", { name: "v. 1" })).toBeInTheDocument();
    // "현재"는 최신 행에만 — 그리고 그 행에는 복원 버튼이 없다
    expect(within(rows[0]).getByText("현재")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("현재")).not.toBeInTheDocument();
    expect(within(rows[0]).queryByRole("button", { name: "이 버전으로 복원" })).not.toBeInTheDocument();
    expect(within(rows[1]).getByRole("button", { name: "이 버전으로 복원" })).toBeInTheDocument();
    // 이름 폴백: 디렉터리에 없으면 저장 시점 스냅샷 → 그것도 없으면 `사용자 #{id}`
    expect(rows[1]).toHaveTextContent("퇴사한 사람");
    expect(rows[0]).toHaveTextContent("사용자 #u405");
    // 날짜는 절대시각(로캘 표기) — "Invalid Date"가 아니다
    expect(rows[1]).toHaveTextContent(new Date("2026-08-01T01:02:03.000Z").toLocaleString("ko-KR"));
    // 변경 요약이 없는 버전은 "—"
    expect(rows[1]).toHaveTextContent("표 정리");
    expect(rows[0]).toHaveTextContent("—");
  });

  it("버전 2개를 고르면 비교가 열리고, 3개째를 고르면 가장 먼저 고른 것이 풀린다", async () => {
    const user = userEvent.setup();
    seedWithUnknownAuthors();
    renderApp("/spaces/sp1/pages/pg2/history");
    await screen.findByRole("heading", { level: 1, name: "페이지 히스토리" });

    const compare = screen.getByRole("button", { name: "선택한 버전 비교" });
    expect(compare).toBeDisabled(); // 정확히 2개일 때만 열린다

    await user.click(screen.getByRole("checkbox", { name: "v. 1 선택" }));
    expect(compare).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "v. 2 선택" }));
    expect(compare).toBeEnabled();

    // 3개째 → 가장 먼저 고른 v. 1이 풀린다(2개 제한 해제 방식)
    await user.click(screen.getByRole("checkbox", { name: "v. 3 선택" }));
    expect(screen.getByRole("checkbox", { name: "v. 1 선택" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "v. 2 선택" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "v. 3 선택" })).toBeChecked();
    expect(compare).toBeEnabled();

    await user.click(compare);
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/spaces/sp1/pages/pg2/history/compare?from=2&to=3",
      );
    });
    expect(await screen.findByRole("heading", { level: 1, name: "v. 2 ↔ v. 3 비교" })).toBeInTheDocument();
  });

  it("버전 목록을 못 읽으면 빈 표가 아니라 에러 상태와 다시 시도를 보여준다", async () => {
    const user = userEvent.setup();
    storeMocks.listVersions.mockRejectedValue(new Error("이력 서비스를 사용할 수 없습니다"));
    renderApp("/spaces/sp1/pages/pg1/history");

    expect(await screen.findByText("히스토리를 불러올 수 없습니다")).toBeInTheDocument();
    expect(screen.getByText("이력 서비스를 사용할 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    storeMocks.listVersions.mockImplementation(mockStore.listVersions);
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("link", { name: "v. 2" })).toBeInTheDocument();
  });
});

describe("W30 이전 버전 보기", () => {
  it("배너가 어느 버전을 보고 있는지 알리고 현재 버전과 비교로 이어진다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1/history/1");

    // 그 시점 제목·본문이 렌더된다(로딩 스켈레톤도 role=status라 본문을 먼저 기다린다)
    expect(await screen.findByText("초기 안내 문서입니다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "시작하기" })).toBeInTheDocument();
    // 배너는 DS Banner(role=status) — 화면에는 다른 status 영역도 있어 문구에서 거슬러 올라간다
    const bannerText = screen.getByText(/이전 버전\(v\. 1\)을 보고 있습니다\./);
    expect(bannerText).toHaveTextContent("김찬호");
    const banner = bannerText.closest('[role="status"]');
    expect(banner).not.toBeNull();

    await user.click(within(banner as HTMLElement).getByRole("button", { name: "현재 버전과 비교" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/spaces/sp1/pages/pg1/history/compare?from=1&to=2",
      );
    });
  });

  it("현재 버전을 열면 배너 대신 '현재 버전입니다' 한 줄이 나온다", async () => {
    renderApp("/spaces/sp1/pages/pg1/history/2");

    expect(await screen.findByText(/현재 버전입니다/)).toBeInTheDocument();
    expect(screen.queryByText(/보고 있습니다/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "히스토리로 돌아가기" })).toBeInTheDocument();
  });
});

describe("W30 복원 확인", () => {
  it("확인 모달에 적은 변경 요약이 복원으로 만들어진 버전에 남는다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1/history/1");
    await screen.findByText("초기 안내 문서입니다.");

    await user.click(screen.getByRole("button", { name: "이 버전으로 복원" }));
    const dialog = await screen.findByRole("dialog", { name: "v. 1으로 복원할까요?" });
    // 기본값은 어디서 되돌렸는지 — 지우고 다시 적을 수 있다
    const note = within(dialog).getByLabelText("변경 요약");
    expect(note).toHaveValue("v. 1에서 복원");
    await user.clear(note);
    await user.type(note, "잘못된 편집 되돌림");
    await user.click(within(dialog).getByRole("button", { name: "복원" }));

    expect(await screen.findByText("v1 버전으로 복원했습니다")).toBeInTheDocument();
    await waitFor(async () => {
      expect((await listVersions("pg1"))[0].changeNote).toBe("잘못된 편집 되돌림");
    });
    // 복원 뒤에는 페이지 보기로 돌아간다
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/spaces/sp1/pages/pg1");
    });
  });

  it("취소하면 아무 버전도 쌓이지 않는다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1/history");
    await screen.findByRole("heading", { level: 1, name: "페이지 히스토리" });

    const rows = screen.getAllByRole("row").slice(1);
    await user.click(within(rows[1]).getByRole("button", { name: "이 버전으로 복원" }));
    const dialog = await screen.findByRole("dialog", { name: "v. 1으로 복원할까요?" });
    await user.click(within(dialog).getByRole("button", { name: "취소" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await listVersions("pg1")).toHaveLength(2);
  });
});
