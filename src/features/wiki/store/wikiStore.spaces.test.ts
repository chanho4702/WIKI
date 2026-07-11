import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createSpace,
  getCurrentUser,
  listSpaces,
  listUsers,
} from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("users", () => {
  it("목업 유저 4명을 반환한다", async () => {
    const users = await listUsers();
    expect(users).toHaveLength(4);
    expect(users[0]).toEqual({ id: "u1", name: "김찬호" });
  });

  it("현재 유저는 u1 고정이다", async () => {
    await expect(getCurrentUser()).resolves.toEqual({ id: "u1", name: "김찬호" });
  });
});

describe("spaces", () => {
  it("첫 실행 시 시드 스페이스(개발 위키)가 생성되고 localStorage에 저장된다", async () => {
    const spaces = await listSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]).toMatchObject({ id: "sp1", key: "DEV", name: "개발 위키" });
    expect(localStorage.getItem("wiki.v1")).not.toBeNull();
  });

  it("createSpace는 키를 대문자로 정규화해 저장한다", async () => {
    const space = await createSpace({ key: "arch", name: "설계 위키" });
    expect(space.key).toBe("ARCH");
    const spaces = await listSpaces();
    expect(spaces.map((s) => s.key)).toEqual(["DEV", "ARCH"]);
  });

  it("키가 중복되면 한국어 메시지로 거부한다 (대소문자 무시)", async () => {
    await expect(createSpace({ key: "dev", name: "중복" })).rejects.toThrow(
      "이미 존재하는 스페이스 키입니다: DEV",
    );
  });

  it("키/이름이 비어 있으면 거부한다", async () => {
    await expect(createSpace({ key: "  ", name: "이름" })).rejects.toThrow(
      "스페이스 키를 입력하세요",
    );
    await expect(createSpace({ key: "ARCH", name: "  " })).rejects.toThrow(
      "스페이스 이름을 입력하세요",
    );
  });

  it("생성한 스페이스는 메모리 캐시 리셋 후에도 localStorage에서 조회된다", async () => {
    await createSpace({ key: "ARCH", name: "설계 위키" });
    __resetForTest(); // 캐시만 비움 — localStorage는 유지
    const spaces = await listSpaces();
    expect(spaces.map((s) => s.key)).toEqual(["DEV", "ARCH"]);
  });

  it("localStorage가 손상된 JSON이면 시드로 재생성한다", async () => {
    localStorage.setItem("wiki.v1", "{corrupted!!");
    __resetForTest();
    const spaces = await listSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0].key).toBe("DEV");
    expect(localStorage.getItem("wiki.v1")).not.toContain("corrupted");
  });
});
