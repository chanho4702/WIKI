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

describe("이동 영향 확인 (W18 §5 — 목업도 같은 규칙)", () => {
  it("제한된 부모 아래로 이동은 MoveImpactError, confirmImpact면 실행", async () => {
    const { movePage } = await import("./wikiStore");
    const { MoveImpactError } = await import("./types");
    await setPageRestrictions("pg1", { view: [{ type: "user", id: "u2" }], edit: [] });

    // pg2(루트)를 제한된 pg1 아래로 — 1차는 영향 오류
    let impact: unknown = null;
    try {
      await movePage("pg2", { parentId: "pg1" });
    } catch (e) {
      impact = e;
    }
    expect(impact).toBeInstanceOf(MoveImpactError);
    expect((impact as InstanceType<typeof MoveImpactError>).newlyRestrictedBy).toEqual([
      { pageId: "pg1", pageTitle: "시작하기", principals: [{ type: "user", id: "u2" }] },
    ]);

    // 2차: 확인 완료 → 실행
    const moved = await movePage("pg2", { parentId: "pg1", confirmImpact: true });
    expect(moved.parentId).toBe("pg1");

    // 이미 그 제한 아래인 이동(pg3 → pg1의 다른 위치)은 영향 없음
    await expect(movePage("pg5", { parentId: "pg1" })).resolves.toBeTruthy();
  });
});
