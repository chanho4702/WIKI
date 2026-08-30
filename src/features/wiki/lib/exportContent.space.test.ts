import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, archivePage, deletePage } from "../store/wikiStore";
import { createSeedData } from "../../../mock/seed";
import { buildSpaceMarkdownExport, countForSpaceExport } from "./exportContent";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/** 스페이스 내보내기(W23) — 살아 있는 문서 전부를 트리 순서로 한 파일에. */
describe("스페이스 내보내기", () => {
  it("루트 순서대로, 각 루트 아래는 깊이 우선으로 이어 붙인다", async () => {
    // 시드: pg1(시작하기) ← pg3(개발 환경 설정) ← pg5(로컬 DB 설정), pg1 ← pg4(배포 가이드); pg2(팀 규칙)
    const md = await buildSpaceMarkdownExport("sp1");
    const order = ["# 시작하기", "# 개발 환경 설정", "# 로컬 DB 설정", "# 배포 가이드", "# 팀 규칙"]
      .map((h) => md.indexOf(h + "\n"));

    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(await countForSpaceExport("sp1")).toBe(5);
  });

  /** 보관·휴지통 문서는 트리 조회에서 빠지므로 내보내기에서도 빠진다. */
  it("보관·삭제된 문서는 빠진다", async () => {
    await archivePage("pg2");
    await deletePage("pg4");

    const md = await buildSpaceMarkdownExport("sp1");
    expect(md).not.toContain("# 팀 규칙");
    expect(md).not.toContain("# 배포 가이드");
    expect(await countForSpaceExport("sp1")).toBe(3);
  });
});
