import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import {
  __resetForTest,
  getPage,
  getSpaceWatchState,
  setPageOwner,
  unverifyPage,
  updatePage,
  verifyPage,
} from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/** 오늘 기준 상대 날짜(`YYYY-MM-DD`) — 고정 날짜를 쓰면 언젠가 저절로 만료된다. */
function daysFromToday(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

describe("W27-4 스페이스 구독 — 화면", () => {
  it("스페이스 헤더의 구독 토글을 누르면 구독되고 다시 누르면 해제된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("heading", { level: 1, name: "개발 위키" });

    const subscribe = await screen.findByRole("button", { name: "스페이스 구독" });
    expect(subscribe).toHaveAttribute("aria-pressed", "false");
    await user.click(subscribe);

    const unsubscribe = await screen.findByRole("button", { name: "스페이스 구독 해제" });
    expect(unsubscribe).toHaveAttribute("aria-pressed", "true");
    expect(await getSpaceWatchState("sp1")).toBe(true);

    await user.click(unsubscribe);
    await screen.findByRole("button", { name: "스페이스 구독" });
    expect(await getSpaceWatchState("sp1")).toBe(false);
  });

  /**
   * 빈 스페이스야말로 "새 문서가 올라오면 알려줘"가 필요한 곳이다 — 전에는 EmptyState만 떠서
   * 스페이스 이름도 구독 토글도 없었다.
   */
  it("페이지가 0개인 스페이스에서도 헤더와 구독 토글이 뜬다", async () => {
    const user = userEvent.setup();
    const seed = createSeedData();
    seed.spaces.push({
      id: "sp2",
      key: "EMPTY",
      name: "빈 위키",
      createdAt: seed.spaces[0].createdAt,
    });
    localStorage.setItem("wiki.v1", JSON.stringify(seed));
    renderApp("/spaces/sp2");

    await screen.findByRole("heading", { level: 1, name: "빈 위키" });
    expect(await screen.findByRole("heading", { name: "아직 페이지가 없습니다" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새 콘텐츠" })).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "스페이스 구독" }));
    await screen.findByRole("button", { name: "스페이스 구독 해제" });
    expect(await getSpaceWatchState("sp2")).toBe(true);
  });

  /** 문서 화면의 구독 버튼과 이름이 갈려야 한다 — 둘 다 "구독"이면 스크린리더에서 구분되지 않는다. */
  it("문서 구독 버튼과 접근 이름이 겹치지 않는다", async () => {
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    expect(screen.getByRole("button", { name: "구독 해제" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "스페이스 구독" })).not.toBeInTheDocument();
  });
});

describe("W27-5 검증 배지 — 화면", () => {
  it("유효한 검증은 success 배지와 유효기간을 보여준다", async () => {
    const until = daysFromToday(30);
    await verifyPage("pg2", until);

    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    expect(await screen.findByText(`검증됨 · ~${until}`)).toBeInTheDocument();
    expect(screen.queryByText("검증 만료")).not.toBeInTheDocument();
  });

  it("유효기간이 지나면 만료 문구로 바뀐다", async () => {
    await verifyPage("pg2", daysFromToday(-1));

    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    expect(await screen.findByText("검증 만료")).toBeInTheDocument();
    expect(screen.queryByText(/검증됨/)).not.toBeInTheDocument();
  });

  it("검증하지 않은 문서에는 배지가 없다", async () => {
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    expect(screen.queryByText(/검증/)).not.toBeInTheDocument();
  });

  it("유효기간 당일까지는 유효하다", async () => {
    const today = daysFromToday(0);
    await verifyPage("pg2", today);

    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    expect(await screen.findByText(`검증됨 · ~${today}`)).toBeInTheDocument();
  });
});

describe("W27-5 검증 후 수정됨 — 화면", () => {
  /** 검증·소유자 지정 같은 메타데이터 변경은 updatedAt을 건드리지 않는다 — 직후에 뜨면 안 된다. */
  it("검증 직후에는 '검증 후 수정됨'이 붙지 않는다", async () => {
    await verifyPage("pg2", daysFromToday(30));
    await setPageOwner("pg2", "u3");

    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await screen.findByText(/검증됨/);
    expect(screen.queryByText("검증 후 수정됨")).not.toBeInTheDocument();
  });

  it("본문을 저장하면 검증 배지 옆에 '검증 후 수정됨'이 붙는다", async () => {
    const until = daysFromToday(30);
    // 검증과 저장이 같은 밀리초에 찍히면 판정이 흔들린다 — 시각을 벌려 고정한다
    const base = new Date();
    vi.useFakeTimers();
    vi.setSystemTime(base);
    await verifyPage("pg2", until);
    vi.setSystemTime(new Date(base.getTime() + 60_000));
    await updatePage("pg2", { body: "검증 뒤에 고친 본문" });
    vi.useRealTimers();

    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    // 검증은 편집으로 풀리지 않는다 — 두 배지가 함께 보인다
    expect(await screen.findByText(`검증됨 · ~${until}`)).toBeInTheDocument();
    expect(screen.getByText("검증 후 수정됨")).toBeInTheDocument();
  });

  it("만료된 검증에도 수정 사실을 함께 알린다", async () => {
    const base = new Date();
    vi.useFakeTimers();
    vi.setSystemTime(base);
    await verifyPage("pg2", daysFromToday(-1));
    vi.setSystemTime(new Date(base.getTime() + 60_000));
    await updatePage("pg2", { body: "만료 뒤에 고친 본문" });
    vi.useRealTimers();

    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    expect(await screen.findByText("검증 만료")).toBeInTheDocument();
    expect(screen.getByText("검증 후 수정됨")).toBeInTheDocument();
  });

  it("검증하지 않은 문서에는 붙지 않는다", async () => {
    await updatePage("pg2", { body: "검증한 적 없는 문서" });

    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    expect(screen.queryByText("검증 후 수정됨")).not.toBeInTheDocument();
  });
});

describe("W27-5 소유자·검증 — 더보기 메뉴", () => {
  it("소유자를 지정하면 메타 줄에 이름이 뜬다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "소유자 지정" }));

    // DS Select는 네이티브 select가 아니라 옵션을 열어 고른다
    await user.click(await screen.findByRole("combobox", { name: "소유자" }));
    await user.click(await screen.findByRole("option", { name: "박준영" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("소유자 박준영")).toBeInTheDocument();
    await waitFor(async () => expect((await getPage("pg2"))?.ownerId).toBe("u3"));
  });

  it("검증하지 않은 문서는 '검증하기', 검증된 문서는 '검증 해제'가 뜬다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await user.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findByRole("menuitem", { name: "검증하기" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "검증 해제" })).not.toBeInTheDocument();
  });

  it("검증하기 다이얼로그의 기본 유효기간은 90일 뒤다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "검증하기" }));

    const field = await screen.findByLabelText("유효기간");
    expect(field).toHaveValue(daysFromToday(90));

    await user.click(screen.getByRole("button", { name: "검증" }));
    expect(await screen.findByText(`검증됨 · ~${daysFromToday(90)}`)).toBeInTheDocument();
  });

  it("검증된 문서는 메뉴에서 바로 해제된다", async () => {
    const user = userEvent.setup();
    await verifyPage("pg2", daysFromToday(30));
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    await screen.findByText(/검증됨/);

    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await user.click(await screen.findByRole("menuitem", { name: "검증 해제" }));

    await waitFor(() => expect(screen.queryByText(/검증됨/)).not.toBeInTheDocument());
    expect((await getPage("pg2"))?.verifiedUntil).toBeNull();
  });
});

describe("W27-5 소유자·검증 — 스토어 계약", () => {
  it("소유자와 검증은 서로 독립이다", async () => {
    await setPageOwner("pg2", "u3");
    await verifyPage("pg2", "2030-01-01");
    expect((await getPage("pg2"))?.ownerId).toBe("u3");

    await unverifyPage("pg2");

    // 검증을 해제해도 소유자는 남는다 — 담당자와 "맞는 내용인가"는 다른 사실이다
    expect((await getPage("pg2"))?.ownerId).toBe("u3");
    expect((await getPage("pg2"))?.verifiedUntil).toBeNull();
  });
});
