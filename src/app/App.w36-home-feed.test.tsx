import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import * as store from "../features/wiki/store/wikiStore";
import type { WikiData } from "../features/wiki/store/types";
import { createSeedData } from "../mock/seed";

/*
 * 홈 피드 전환(2026-10-24) — 컨플 홈 "Discover what's happening". 최근 업데이트(기본)·팔로잉·인기를
 * 필 토글로 바꾸고, 선택은 URL(`?feed=`)에 남는다. 팔로잉·인기는 `/api/wiki/feed/*`(목업은 같은 규칙).
 */

const recently = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

/** 시드를 고쳐 심는다 — 인기는 최근 90일 안에 수정된 게시 문서만 순위에 오른다. */
function seed(edit?: (data: WikiData) => void) {
  const data = createSeedData() as WikiData;
  const set = (id: string, views: number, daysAgo: number) => {
    const page = data.pages.find((p) => p.id === id)!;
    page.views = views;
    page.updatedAt = recently(daysAgo);
  };
  set("pg1", 3, 1);
  set("pg2", 12, 2);
  set("pg3", 7, 3);
  set("pg4", 50, 120); // 조회는 가장 많지만 90일 밖 — 인기에서 빠진다
  edit?.(data);
  localStorage.setItem("wiki.v1", JSON.stringify(data));
}

// 섹션 이름은 "새 소식", 첫 피드 필이 "최근 업데이트"다(같은 말이 두 번 보이던 것을 나눴다)
async function feedSection() {
  return screen.findByRole("region", { name: "새 소식" });
}

beforeEach(() => {
  localStorage.clear();
  store.__resetForTest();
});
afterEach(() => vi.restoreAllMocks());

describe("홈 피드 전환", () => {
  it("기본은 최근 업데이트이고, 인기를 고르면 조회수순으로 조회수를 함께 보이며 URL에 남는다", async () => {
    const user = userEvent.setup();
    seed();
    renderApp("/home");

    const section = await feedSection();
    const toggle = within(section).getByRole("group", { name: "피드 보기" });
    expect(within(toggle).getByRole("button", { name: "최근 업데이트" })).toHaveAttribute("aria-pressed", "true");
    expect(await within(section).findByRole("link", { name: "배포 가이드" })).toBeInTheDocument();

    await user.click(within(toggle).getByRole("button", { name: "인기" }));
    expect(within(toggle).getByRole("button", { name: "인기" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/home?feed=popular"));

    const list = await within(section).findByRole("list");
    const titles = within(list).getAllByRole("link").map((a) => a.textContent);
    expect(titles.slice(0, 3)).toEqual(["팀 규칙", "개발 환경 설정", "시작하기"]);
    expect(titles).not.toContain("배포 가이드");
    expect(within(list).getByText(/조회 12회/)).toBeInTheDocument();

    await user.click(within(toggle).getByRole("button", { name: "최근 업데이트" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/home$/));
  });

  it("URL의 선택으로 바로 연다 — 새로 고침·링크 공유에서도 같은 피드", async () => {
    seed();
    renderApp("/home?feed=popular");
    const section = await feedSection();
    expect(within(section).getByRole("button", { name: "인기" })).toHaveAttribute("aria-pressed", "true");
    expect(await within(section).findByText(/조회 12회/)).toBeInTheDocument();
  });

  it("팔로잉은 구독한 문서·스페이스의 게시 문서를 최근 수정순으로 보이고 조회수는 싣지 않는다", async () => {
    const user = userEvent.setup();
    seed((d) => {
      d.watches = { pg3: ["u1"], pg4: ["u2"] };
      d.spaceWatches = {};
    });
    renderApp("/home");
    const section = await feedSection();
    await user.click(within(section).getByRole("button", { name: "팔로잉" }));

    const list = await within(section).findByRole("list");
    expect(within(list).getAllByRole("link").map((a) => a.textContent)).toEqual(["개발 환경 설정"]);
    expect(within(list).queryByText(/조회/)).toBeNull();
  });

  it("구독한 것이 없으면 빈 상태 안내와 스페이스 둘러보기 링크를 보인다", async () => {
    const user = userEvent.setup();
    seed((d) => {
      d.watches = {};
      d.spaceWatches = {};
    });
    renderApp("/home");
    const section = await feedSection();
    await user.click(within(section).getByRole("button", { name: "팔로잉" }));

    expect(await within(section).findByText(/구독한 스페이스나 문서가 없습니다/)).toBeInTheDocument();
    await user.click(within(section).getByRole("link", { name: "스페이스 둘러보기" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/spaces$/));
  });

  it("피드를 못 읽으면(503) 빈 목록이 아니라 오류를 보이고, 다시 시도한다", async () => {
    const user = userEvent.setup();
    seed();
    const popular = vi
      .spyOn(store, "listPopularFeed")
      .mockRejectedValueOnce(new Error("권한 서비스를 사용할 수 없습니다"));
    renderApp("/home?feed=popular");
    const section = await feedSection();

    const alert = await within(section).findByRole("alert");
    expect(alert).toHaveTextContent("피드를 불러오지 못했습니다: 권한 서비스를 사용할 수 없습니다");
    expect(within(section).queryByText(/최근 90일 안에 수정된 문서가 없습니다/)).toBeNull();

    await user.click(within(alert).getByRole("button", { name: "다시 시도" }));
    expect(await within(section).findByText(/조회 12회/)).toBeInTheDocument();
    expect(popular).toHaveBeenCalledTimes(2);
  });

  it("아직 피드 경로가 없는 서버(404→null)면 제공하지 않는다고 알린다", async () => {
    seed();
    vi.spyOn(store, "listFollowingFeed").mockResolvedValue(null);
    renderApp("/home?feed=following");
    const section = await feedSection();
    expect(await within(section).findByText("이 서버는 아직 이 피드를 제공하지 않습니다.")).toBeInTheDocument();
  });

  it("공개 문서(읽기 전용)에서는 팔로잉을 숨기고, ?feed=following이어도 최근 업데이트로 보인다", async () => {
    seed();
    const following = vi.spyOn(store, "listFollowingFeed");
    renderApp("/home?feed=following", { readOnly: true });
    const section = await feedSection();
    const toggle = within(section).getByRole("group", { name: "피드 보기" });

    expect(within(toggle).queryByRole("button", { name: "팔로잉" })).toBeNull();
    expect(within(toggle).getByRole("button", { name: "인기" })).toBeInTheDocument();
    expect(within(toggle).getByRole("button", { name: "최근 업데이트" })).toHaveAttribute("aria-pressed", "true");
    expect(following).not.toHaveBeenCalled();
  });
});
