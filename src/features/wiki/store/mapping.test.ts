import { describe, expect, it } from "vitest";
import { toClientId, toBackendId, mapSpace, mapPage, mapPageTree, extractError } from "./mapping";

describe("id 변환", () => {
  it("Long↔string 왕복", () => {
    expect(toClientId(42)).toBe("42");
    expect(toBackendId("42")).toBe(42);
  });
  it("숫자가 아닌 id는 거부", () => {
    expect(() => toBackendId("abc")).toThrow();
  });
});

describe("mapSpace", () => {
  it("id를 string으로, description null은 undefined로 정규화", () => {
    const s = mapSpace({ id: 7, key: "DEV", name: "개발", description: null });
    expect(s).toMatchObject({ id: "7", key: "DEV", name: "개발", description: undefined, createdAt: "" });
  });
});

describe("mapPage", () => {
  it("content→body, id/spaceId/parentId를 string으로, version 유지", () => {
    const p = mapPage({ id: 1, spaceId: 2, parentId: null, title: "T", content: "본문", version: 3 });
    expect(p).toMatchObject({ id: "1", spaceId: "2", parentId: null, title: "T", body: "본문", version: 3 });
  });
});

describe("mapPageTree", () => {
  it("flat 트리 항목을 position 없이 순서대로 매핑(index+1을 position으로)", () => {
    const rows = [{ id: 1, parentId: null, title: "A" }, { id: 2, parentId: 1, title: "B" }];
    const pages = mapPageTree(rows);
    expect(pages[0]).toMatchObject({ id: "1", parentId: null, title: "A", position: 1 });
    expect(pages[1]).toMatchObject({ id: "2", parentId: "1", title: "B", position: 2 });
  });
});

describe("extractError", () => {
  it("body.error 문구를 우선 사용", () => {
    expect(extractError(404, { error: "페이지를 찾을 수 없습니다" })).toBe("페이지를 찾을 수 없습니다");
  });
  it("409는 충돌 안내로 폴백", () => {
    expect(extractError(409, {})).toContain("다른 사용자");
  });
});
