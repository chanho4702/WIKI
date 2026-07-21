import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

function mockApiFetch(status: number, body: unknown) {
  return vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}
afterEach(() => vi.restoreAllMocks());

describe("wikiApi.listSpaces", () => {
  it("GET /api/wiki/spaces 결과를 Space[]로 매핑(id string, description)", async () => {
    mockApiFetch(200, [{ id: 7, key: "DEV", name: "개발", description: "d" }]);
    const { listSpaces } = await import("./wikiApi");
    const spaces = await listSpaces();
    expect(spaces[0]).toMatchObject({ id: "7", key: "DEV", name: "개발", description: "d" });
  });
});

describe("wikiApi.createSpace", () => {
  it("POST 후 매핑, 4xx는 body.error를 한국어로 throw", async () => {
    mockApiFetch(409, { error: "이미 존재하는 스페이스 키입니다" });
    const { createSpace } = await import("./wikiApi");
    await expect(createSpace({ key: "DEV", name: "개발" })).rejects.toThrow("이미 존재하는 스페이스 키입니다");
  });
});
