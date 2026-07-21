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
    const spy = mockApiFetch(409, { error: "이미 존재하는 스페이스 키입니다" });
    const { createSpace } = await import("./wikiApi");
    await expect(createSpace({ key: "DEV", name: "개발" })).rejects.toThrow("이미 존재하는 스페이스 키입니다");
    expect(spy).toHaveBeenCalledWith("/api/wiki/spaces", expect.objectContaining({ method: "POST" }));
  });

  it("POST 성공 시 응답을 Space로 매핑하고 key를 소문자로 보낸다", async () => {
    const spy = mockApiFetch(201, { id: 12, key: "ops", name: "운영", description: "" });
    const { createSpace } = await import("./wikiApi");
    const space = await createSpace({ key: "OPS", name: "운영" });
    expect(space).toMatchObject({ id: "12", key: "ops", name: "운영" });
    const init = spy.mock.calls[0][1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toMatchObject({ key: "ops", name: "운영" });
  });
});
