import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, seedPlatformFeatures } from "./testUtils";
import {
  __resetForTest,
  archivePage,
  createPage,
  listBlogPostPage,
  listMyTasks,
  movePage,
  publishPage,
  searchContent,
  setLabels,
  setPageIcon,
  setTaskDone,
  updatePage,
} from "../features/wiki/store/wikiStore";
import * as store from "../features/wiki/store/wikiStore";

/*
 * wiki-backend 웨이브 2 계약 동기화 — 작업 토글 대조(409)·블로그 쪽 넘김(X-Next-Before)·라이트 검색 pageTypes·
 * 보관 문서 쓰기 409·알림 빈 쪽 이어 읽기. 목업도 같은 규칙이다.
 */

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});
afterEach(() => vi.restoreAllMocks());

describe("작업 토글 — 화면이 본 줄 text 대조", () => {
  it("그사이 위에 줄이 들어가 같은 줄 번호가 다른 항목이면 거부한다", async () => {
    const page = await createPage({ spaceId: "sp1", title: "할 일", body: "- [ ] 첫째 [@김찬호](user:u1)\n- [ ] 둘째 [@김찬호](user:u1)" });
    const first = (await listMyTasks(false)).find((t) => t.pageId === page.id)!;
    await updatePage(page.id, { body: "- [ ] 새로 넣은 줄\n- [ ] 첫째 [@김찬호](user:u1)\n- [ ] 둘째 [@김찬호](user:u1)" });

    await expect(setTaskDone(page.id, first.lineNo, true, first.text)).rejects.toThrow("그 줄의 작업 항목이 바뀌었습니다");
    // 지금 그 줄의 text를 주면 통과
    await setTaskDone(page.id, 2, true, first.text);
  });

  it("내 작업 화면은 본 줄 text를 보내고, 거부되면 안내한다", async () => {
    const user = userEvent.setup();
    const page = await createPage({ spaceId: "sp1", title: "할 일", body: "- [ ] 첫째 [@김찬호](user:u1)" });
    const text = (await listMyTasks(false)).find((t) => t.pageId === page.id)!.text;
    const spy = vi.spyOn(store, "setTaskDone").mockRejectedValue(new Error("그 줄의 작업 항목이 바뀌었습니다. 문서를 새로고침하세요"));
    renderApp("/tasks");
    await user.click(await screen.findByRole("checkbox", { name: /첫째/ }));

    expect(await screen.findByText("그 줄의 작업 항목이 바뀌었습니다. 문서를 새로고침하세요")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(page.id, 1, true, text);
  });
});

describe("블로그 쪽 넘김", () => {
  it("스토어: 쪽마다 nextBefore를 주고 마지막 쪽은 null이다", async () => {
    for (let i = 0; i < 25; i++) await createPage({ spaceId: "sp1", title: `글 ${i}`, type: "blog" });
    const first = await listBlogPostPage("sp1", { limit: 20 });
    expect(first.items).toHaveLength(20);
    const second = await listBlogPostPage("sp1", { limit: 20, before: first.nextBefore! });
    expect(second.items).toHaveLength(5);
    expect(second.nextBefore).toBeNull();
    expect(new Set([...first.items, ...second.items].map((p) => p.id)).size).toBe(25);
  });

  it("화면: 20개를 먼저 보이고 '이전 글 더 보기'로 나머지를 읽는다", async () => {
    const user = userEvent.setup();
    for (let i = 0; i < 25; i++) await createPage({ spaceId: "sp1", title: `글 ${i}`, type: "blog" });
    renderApp("/spaces/sp1/blog");
    const list = await screen.findByRole("list", { name: "블로그 글" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(20);
    await user.click(screen.getByRole("button", { name: "이전 글 더 보기" }));
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(25));
    expect(screen.queryByRole("button", { name: "이전 글 더 보기" })).not.toBeInTheDocument();
  });

  it("빈 쪽이어도 커서가 있으면 이어 읽는다(권한 필터로 한 쪽이 통째로 걸러진 경우)", async () => {
    const spy = vi.spyOn(store, "listBlogPostPage")
      .mockResolvedValueOnce({ items: [], nextBefore: "c1" })
      .mockResolvedValueOnce({
        items: [{
          id: "b9", title: "늦게 온 글", status: "published", icon: null, createdBy: "u1", updatedBy: "u1",
          createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", excerpt: "",
        }],
        nextBefore: null,
      });
    renderApp("/spaces/sp1/blog");
    expect(await screen.findByRole("link", { name: "늦게 온 글" })).toBeInTheDocument();
    expect(spy).toHaveBeenLastCalledWith("sp1", { before: "c1", limit: 20 });
  });
});

describe("검색 '블로그만'(라이트 검색 pageTypes)", () => {
  it("라이트 설치에서는 종류 필터에 '블로그'가 있고 블로그 글만 나온다", async () => {
    const user = userEvent.setup();
    seedPlatformFeatures("lite");
    await createPage({ spaceId: "sp1", title: "분기회고 블로그", type: "blog" });
    await createPage({ spaceId: "sp1", title: "분기회고 문서" });
    renderApp("/search?q=분기회고");
    await waitFor(() =>
      expect(within(screen.getByRole("list", { name: /검색 결과/ })).getAllByRole("listitem")).toHaveLength(2));

    await user.click(screen.getByLabelText("종류"));
    await user.click(await screen.findByRole("option", { name: "블로그" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("type=BLOG"));
    await waitFor(() => {
      const items = within(screen.getByRole("list", { name: /검색 결과/ })).getAllByRole("listitem");
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent("분기회고 블로그");
    });
  });

  it("OpenSearch 설치에는 '블로그'가 없고, 주소에 type=BLOG가 남아 있어도 걸러 내지 않는다", async () => {
    const user = userEvent.setup();
    seedPlatformFeatures("opensearch");
    await createPage({ spaceId: "sp1", title: "분기회고 블로그", type: "blog" });
    await createPage({ spaceId: "sp1", title: "분기회고 문서" });
    const spy = vi.spyOn(store, "searchContent");
    renderApp("/search?q=분기회고&type=BLOG");
    await waitFor(() =>
      expect(within(screen.getByRole("list", { name: /검색 결과/ })).getAllByRole("listitem")).toHaveLength(2));
    expect(spy.mock.calls.every(([input]) => input.pageTypes === undefined)).toBe(true);

    await user.click(screen.getByLabelText("종류"));
    await screen.findByRole("option", { name: "첨부파일" });
    expect(screen.queryByRole("option", { name: "블로그" })).not.toBeInTheDocument();
  });

  it("스토어 계약: pageTypes는 문서 결과에만 걸린다", async () => {
    await createPage({ spaceId: "sp1", title: "고유어휘 블로그", type: "blog" });
    await createPage({ spaceId: "sp1", title: "고유어휘 문서" });
    const hits = await searchContent({ query: "고유어휘", pageTypes: ["BLOG"] });
    expect(hits.hits.map((h) => h.title)).toEqual(["고유어휘 블로그"]);
  });
});

describe("보관 문서 쓰기는 어느 경로든 거부(서버 409와 같은 문구)", () => {
  it("저장·아이콘·라벨·게시·이동·하위 생성이 모두 거부된다", async () => {
    await archivePage("pg2");
    const msg = "보관된 문서는 편집할 수 없습니다";
    await expect(updatePage("pg2", { body: "x" })).rejects.toThrow(msg);
    await expect(setPageIcon("pg2", "📘")).rejects.toThrow(msg);
    await expect(setLabels("pg2", ["a"])).rejects.toThrow(msg);
    await expect(publishPage("pg2")).rejects.toThrow(msg);
    await expect(movePage("pg2", { parentId: "pg1" })).rejects.toThrow(msg);
    await expect(movePage("pg3", { parentId: "pg2" })).rejects.toThrow("보관된 문서 아래로는");
    await expect(createPage({ spaceId: "sp1", parentId: "pg2", title: "자식" })).rejects.toThrow("보관된 문서 아래로는");
  });
});

describe("알림 — 빈 쪽이어도 nextBefore가 있으면 끝이 아니다", () => {
  it("첫 쪽이 비고 커서가 있으면 이어 읽어 다음 쪽 알림을 보인다", async () => {
    // 벨도 같은 함수를 부르므로 호출 순서가 아니라 커서로 답한다
    const spy = vi.spyOn(store, "listNotifications").mockImplementation(async (options = {}) =>
      options.before === "77"
        ? {
            unreadCount: 1,
            items: [{
              id: "n1", userId: "u1", type: "mentioned", pageId: "pg1", spaceId: "sp1", pageTitle: "멀리 있는 알림",
              actorId: "u2", createdAt: "2026-10-01T00:00:00Z", read: false,
            }],
            nextBefore: null,
          }
        : { unreadCount: 1, items: [], nextBefore: "77" });
    renderApp("/notifications");
    expect(await screen.findByText("멀리 있는 알림")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ before: "77" }));
  });
});
