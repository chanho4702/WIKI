import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, getPage, listMyTasks, listVersions, updatePage } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/**
 * 액션 아이템(W23). 체크박스 목록은 있었지만 "누가 언제까지"가 없어서 회의록의 할 일이 회의록
 * 안에서만 살았다. 멘션이 담당자, 날짜가 기한 — 새 문법은 없다.
 */
describe("W23 액션 아이템 — 스토어 계약", () => {
  it("내 작업은 나를 멘션한 미완료 항목이고 기한순이다", async () => {
    await updatePage("pg2", {
      body: "- [ ] 늦은 일 [@나](user:u1) [2026-12-01](date:2026-12-01)\n- [ ] 급한 일 [@나](user:u1) [2026-09-01](date:2026-09-01)\n- [ ] 남 일 [@너](user:u2)\n- [x] 끝난 일 [@나](user:u1)",
    });

    const mine = await listMyTasks(false);
    expect(mine.map((t) => t.text)).toEqual(["급한 일 @나 2026-09-01", "늦은 일 @나 2026-12-01"]);
    expect((await listMyTasks(true)).map((t) => t.text)).toEqual(["끝난 일 @나"]);
  });
});

describe("W23 액션 아이템 — 화면", () => {
  it("내 작업에서 체크하면 그 문서의 본문이 바뀌고 리비전이 남는다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { body: "- [ ] 배포 공지 [@나](user:u1)" });
    const before = (await listVersions("pg2")).length;
    renderApp("/tasks");
    await screen.findByRole("heading", { name: "내 작업" });

    await user.click(await screen.findByRole("checkbox", { name: "배포 공지 @나" }));

    await waitFor(async () => {
      expect((await getPage("pg2"))?.body).toBe("- [x] 배포 공지 [@나](user:u1)");
    });
    expect((await listVersions("pg2")).length).toBe(before + 1);
    expect(await screen.findByRole("heading", { name: "남은 작업이 없습니다" })).toBeInTheDocument();
  });

  it("본문의 체크박스를 직접 누를 수 있다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { body: "앞 문단\n\n- [ ] 배포 공지 [@나](user:u1)" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    const article = screen.getByRole("article");
    await user.click(within(article).getByRole("checkbox", { name: "작업 완료" }));

    await waitFor(async () => {
      expect((await getPage("pg2"))?.body).toContain("- [x] 배포 공지");
    });
  });
});
