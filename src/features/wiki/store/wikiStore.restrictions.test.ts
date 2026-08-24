import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  getPageRestrictions,
  setPageRestrictions,
} from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("페이지 제한 (W18 목업 — 저장·상속 표시)", () => {
  it("기본은 제한 없음(빈 목록)", async () => {
    const r = await getPageRestrictions("pg1");
    expect(r).toEqual({ view: [], edit: [], inherited: [] });
  });

  it("전체 교체로 저장·해제된다 — 둘 다 비우면 키 자체가 사라진다", async () => {
    const saved = await setPageRestrictions("pg1", {
      view: [{ type: "user", id: "u1" }],
      edit: [{ type: "team", id: "t1" }],
    });
    expect(saved.view).toEqual([{ type: "user", id: "u1" }]);
    expect(saved.edit).toEqual([{ type: "team", id: "t1" }]);

    await setPageRestrictions("pg1", { view: [], edit: [] });
    const data = JSON.parse(localStorage.getItem("wiki.v1")!) as { restrictions?: Record<string, unknown> };
    expect(data.restrictions?.pg1).toBeUndefined();
  });

  it("조상의 보기 제한이 inherited로 표시된다 (pg5 ← pg3 ← pg1)", async () => {
    await setPageRestrictions("pg1", { view: [{ type: "user", id: "u2" }], edit: [] });
    const r = await getPageRestrictions("pg5");
    expect(r.inherited).toEqual([
      { pageId: "pg1", pageTitle: "시작하기", principals: [{ type: "user", id: "u2" }] },
    ]);
    // 편집 제한만 있는 조상은 상속 표시 대상이 아니다(EDIT 비상속)
    await setPageRestrictions("pg3", { view: [], edit: [{ type: "user", id: "u2" }] });
    const again = await getPageRestrictions("pg5");
    expect(again.inherited.map((i) => i.pageId)).toEqual(["pg1"]);
  });

  it("없는 페이지는 한국어 에러", async () => {
    await expect(getPageRestrictions("없음")).rejects.toThrow("페이지를 찾을 수 없습니다");
  });
});
