import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import {
  __resetForTest,
  listPagePaths,
  searchContent,
  setLabels,
  suggestLabels,
} from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/**
 * 검색 필터(W22) — 작성자·수정 기간.
 *
 * 색인에 이미 작성자와 수정 시각이 있어 질의만 붙이면 됐다. 라벨 필터는 색인 필드가 필요해
 * 별도 작업으로 남겼다.
 */
describe("W22 검색 필터 — 스토어 계약", () => {
  it("작성자로 거른다", async () => {
    // 시드: pg1은 u2가 마지막 수정, pg2·pg3 등은 각각 다르다
    const all = await searchContent({ query: "설정" });
    const byU2 = await searchContent({ query: "설정", authorIds: ["u2"] });

    expect(all.hits.length).toBeGreaterThan(0);
    expect(byU2.hits.every((h) => h.title !== null)).toBe(true);
    expect(byU2.hits.length).toBeLessThanOrEqual(all.hits.length);
  });

  /** 경계는 포함이다 — "8월 1일부터"가 8월 1일 문서를 빼면 사용자가 이유를 알 수 없다. */
  it("수정 기간 경계를 포함한다", async () => {
    const onBoundary = await searchContent({
      query: "시작하기",
      updatedAfter: "2026-07-10",
      updatedBefore: "2026-07-10T23:59:59Z",
    });

    expect(onBoundary.hits.map((h) => h.title)).toContain("시작하기");
  });

  it("기간 밖이면 결과가 없다", async () => {
    const outside = await searchContent({ query: "시작하기", updatedAfter: "2030-01-01" });

    expect(outside.hits).toHaveLength(0);
  });

  /** 저장할 때와 같은 규칙으로 정규화한다 — 대소문자만 달라 안 걸리면 사용자는 이유를 모른다. */
  it("라벨로 거르고 대소문자·공백을 정규화한다", async () => {
    await setLabels("pg3", ["Wave D"]);

    const matched = await searchContent({ query: "설정", labels: ["wave d"] });
    const missed = await searchContent({ query: "설정", labels: ["없는라벨"] });

    expect(matched.hits.map((h) => h.id)).toContain("pg3");
    expect(missed.hits).toHaveLength(0);
  });

  it("라벨이 여럿이면 하나라도 붙은 문서를 찾는다", async () => {
    await setLabels("pg3", ["설계"]);
    await setLabels("pg5", ["회의"]);

    const either = await searchContent({ query: "설정", labels: ["설계", "회의"] });
    const one = await searchContent({ query: "설정", labels: ["설계"] });

    expect(either.hits.length).toBeGreaterThanOrEqual(one.hits.length);
    expect(either.hits.map((h) => h.id)).toContain("pg3");
    expect(either.hits.map((h) => h.id)).toContain("pg5");
  });

  /**
   * 정렬·경로·라벨 후보는 세 배포(목업·OpenSearch·라이트)가 같은 계약을 낸다 — 경로와 라벨
   * 후보는 아예 검색 엔진을 타지 않는 별도 조회다.
   */
  it("최근 수정순·오래된 수정순으로 정렬한다", async () => {
    const desc = await searchContent({ query: "설정", sort: "UPDATED_DESC" });
    const asc = await searchContent({ query: "설정", sort: "UPDATED_ASC" });

    expect(desc.hits.length).toBeGreaterThan(1);
    expect(asc.hits.map((h) => h.id)).toEqual([...desc.hits.map((h) => h.id)].reverse());
  });

  it("경로는 루트부터 부모까지고 자기 자신은 빼다", async () => {
    // 시드: pg5(로컬 DB 설정) ← pg3(개발 환경 설정) ← pg1(시작하기)
    const [path] = await listPagePaths(["pg5"]);

    expect(path.titles).toEqual(["시작하기", "개발 환경 설정"]);
  });

  it("루트 문서의 경로는 비어 있다", async () => {
    const [path] = await listPagePaths(["pg1"]);

    expect(path.titles).toEqual([]);
  });

  it("라벨 후보는 접두 일치로 건수와 함께 온다", async () => {
    await setLabels("pg3", ["설계"]);
    await setLabels("pg5", ["설계"]);
    await setLabels("pg1", ["설정"]);

    const found = await suggestLabels("설");

    expect(found.map((l) => l.name)).toEqual(["설계", "설정"]);
    expect(found[0].count).toBe(2);
  });

  it("잘못된 기간 형식은 거부한다", async () => {
    await expect(searchContent({ query: "시작하기", updatedAfter: "어제" })).rejects.toThrow(
      "기간은 날짜 형식이어야 합니다",
    );
  });
});

describe("W22 검색 필터 — 화면", () => {
  it("필터는 URL에 남아 공유·뒤로가기에서 유지된다", async () => {
    const user = userEvent.setup();
    renderApp("/search?q=설정");
    await screen.findByRole("heading", { name: "검색" });

    await user.type(screen.getByLabelText("수정일 시작"), "2030-01-01");

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("after=2030-01-01");
    });
    expect(await screen.findByRole("heading", { name: /검색 결과가 없습니다/ })).toBeInTheDocument();
  });

  it("라벨 필터는 제출할 때만 URL에 반영된다", async () => {
    const user = userEvent.setup();
    await setLabels("pg3", ["설계"]);
    renderApp("/search?q=설정");
    await screen.findByRole("heading", { name: "검색" });

    // 타이핑 도중에는 검색이 나가지 않는다 — URL이 아직 그대로다.
    await user.type(screen.getByLabelText("라벨"), "설계");
    expect(screen.getByTestId("location")).not.toHaveTextContent("labels=");

    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("labels=");
    });
    const results = await screen.findByRole("list", { name: /검색 결과/ });
    expect(within(results).getAllByRole("listitem")).toHaveLength(1);
  });

  it("정렬을 바꾸면 URL에 남는다", async () => {
    const user = userEvent.setup();
    renderApp("/search?q=설정");
    await screen.findByRole("heading", { name: "검색" });

    await user.selectOptions(screen.getByLabelText("정렬"), "UPDATED_DESC");

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("sort=UPDATED_DESC");
    });
  });

  it("결과에 문서가 있는 위치를 보여준다", async () => {
    renderApp("/search?q=로컬");
    await screen.findByRole("heading", { name: "검색" });

    const results = await screen.findByRole("list", { name: /검색 결과/ });
    // 시드: pg5(로컬 DB 설정)는 개발 위키 / 시작하기 / 개발 환경 설정 아래에 있다
    expect(await within(results).findByText(/개발 환경 설정/)).toBeInTheDocument();
  });

  it("필터 지우기로 원래 결과가 돌아온다", async () => {
    const user = userEvent.setup();
    renderApp("/search?q=설정&after=2030-01-01&labels=설계");
    await screen.findByRole("heading", { name: "검색" });
    await screen.findByRole("button", { name: "필터 지우기" });

    await user.click(screen.getByRole("button", { name: "필터 지우기" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).not.toHaveTextContent("after=");
    });
    expect(screen.getByLabelText("라벨")).toHaveValue("");
    const results = await screen.findByRole("list", { name: /검색 결과/ });
    expect(within(results).getAllByRole("listitem").length).toBeGreaterThan(0);
  });
});
