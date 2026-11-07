import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
import { ALM_CARD_BATCH_LIMIT, fetchAlmIssueCards as apiFetchCards } from "./api/alm";
import { fetchAlmIssueCards as mockFetchCards } from "./mock/alm";
import { mapAlmIssueCard } from "./mapping";

/** ALM 이슈 카드(W3) — 어댑터·목업·경계 매퍼. 계약 정본은 설계 2026-11-08 §4.1. */

const DTO = {
  key: "PLAT-12",
  projectId: 3,
  projectKey: "PLAT",
  title: "카드 조회",
  type: { id: "task", name: "작업", icon: "check-square", color: "info" },
  status: { id: "inprogress", name: "진행 중", kind: "active", color: "info", icon: "circle" },
  priority: { id: "high", name: "높음", icon: "arrow-up", color: "warning" },
  assignee: { id: 7, displayName: "Alice Kim" },
  dueDate: "2026-11-30",
  resolved: false,
  url: "/alm/browse/PLAT-12",
};

afterEach(() => vi.restoreAllMocks());

describe("mapAlmIssueCard", () => {
  it("계약 모양을 도메인으로 — id는 string", () => {
    expect(mapAlmIssueCard(DTO)).toEqual({
      ...DTO,
      projectId: "3",
      assignee: { id: "7", displayName: "Alice Kim" },
    });
  });

  it("레지스트리에 없는 값(icon·color null)·담당자 없음·기한 없음을 견딘다", () => {
    const card = mapAlmIssueCard({
      ...DTO,
      type: { id: "custom", name: "custom", icon: null, color: null },
      priority: null,
      assignee: null,
      dueDate: null,
    });
    expect(card).toMatchObject({ type: { icon: null, color: null }, priority: null, assignee: null, dueDate: null });
  });

  it("org 장애로 담당자 이름이 null이어도 카드는 살린다", () => {
    expect(mapAlmIssueCard({ ...DTO, assignee: { id: 7, displayName: null } })?.assignee).toEqual({
      id: "7",
      displayName: null,
    });
  });

  it("상태 kind가 complete면 완료로 본다", () => {
    expect(mapAlmIssueCard({ ...DTO, status: { ...DTO.status, kind: "complete" } })?.resolved).toBe(true);
  });

  it("키·제목·상태가 없는 항목은 버린다(그 링크는 일반 링크로 남는다)", () => {
    expect(mapAlmIssueCard({ ...DTO, key: "" })).toBeNull();
    expect(mapAlmIssueCard({ ...DTO, title: null })).toBeNull();
    expect(mapAlmIssueCard({ ...DTO, status: null })).toBeNull();
    expect(mapAlmIssueCard("nope")).toBeNull();
  });
});

describe("fetchAlmIssueCards (백엔드 어댑터)", () => {
  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  it("GET /api/alm/issues/cards?keys= 한 번으로 묻는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(respond([DTO]));

    const cards = await apiFetchCards(["PLAT-12", "WIKI-3", "PLAT-12"]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(`/api/alm/issues/cards?keys=${encodeURIComponent("PLAT-12,WIKI-3")}`);
    expect(cards.map((c) => c.key)).toEqual(["PLAT-12"]);
  });

  it("빈 키면 묻지 않는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch");
    await expect(apiFetchCards([])).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("서버 상한(50)을 넘으면 나눠 묻는다", async () => {
    const spy = vi.spyOn(client, "sharedApiFetch").mockImplementation(async () => respond([]));
    const keys = Array.from({ length: ALM_CARD_BATCH_LIMIT + 1 }, (_, i) => `PLAT-${i + 1}`);

    await apiFetchCards(keys);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("실패는 던진다 — 삼키는 것은 화면 훅의 정책이다", async () => {
    vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(respond({ error: "장애" }, 503));
    await expect(apiFetchCards(["PLAT-12"])).rejects.toThrow("장애");
  });
});

describe("fetchAlmIssueCards (목업)", () => {
  it("아는 키만 요청 순서대로 — 모르는 키는 조용히 빠진다", async () => {
    const cards = await mockFetchCards(["wiki-7", "NOPE-1", "ALM-1"]);
    expect(cards.map((c) => c.key)).toEqual(["WIKI-7", "ALM-1"]);
  });

  it("깊은 복사본을 준다", async () => {
    const [first] = await mockFetchCards(["ALM-1"]);
    first.title = "변경";
    const [again] = await mockFetchCards(["ALM-1"]);
    expect(again.title).not.toBe("변경");
  });
});
