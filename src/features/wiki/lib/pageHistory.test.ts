import { describe, expect, it } from "vitest";
import type { PageVersion, User } from "../store/types";
import { formatVersionDateTime, versionAuthorName, versionLabel } from "./pageHistory";

function version(patch: Partial<PageVersion> = {}): PageVersion {
  return {
    id: "pv1",
    pageId: "pg1",
    version: 1,
    title: "제목",
    body: "본문",
    savedBy: "u1",
    savedAt: "2026-09-06T05:10:00.000Z",
    ...patch,
  };
}

describe("versionLabel", () => {
  it("컨플루언스와 같은 'v. N' 형식", () => {
    expect(versionLabel(7)).toBe("v. 7");
  });
});

describe("formatVersionDateTime", () => {
  it("ISO 시각은 ko-KR 절대 표기", () => {
    expect(formatVersionDateTime("2026-09-06T05:10:00.000Z")).toBe(
      new Date("2026-09-06T05:10:00.000Z").toLocaleString("ko-KR"),
    );
  });

  /** 백엔드 모드는 시각이 비어 온다 — 표에 "Invalid Date"가 박히면 안 된다. */
  it("빈 값·무효 값은 빈 문자열", () => {
    expect(formatVersionDateTime("")).toBe("");
    expect(formatVersionDateTime("어제")).toBe("");
  });
});

describe("versionAuthorName", () => {
  const users: User[] = [{ id: "u1", name: "김찬호" }];

  it("디렉터리에 있으면 그 이름", () => {
    expect(versionAuthorName(users, version())).toBe("김찬호");
  });

  it("없으면 저장 시점 스냅샷 이름", () => {
    expect(versionAuthorName(users, version({ savedBy: "u9", savedByName: "퇴사한 사람" }))).toBe(
      "퇴사한 사람",
    );
  });

  it("스냅샷도 없으면 id 폴백", () => {
    expect(versionAuthorName(users, version({ savedBy: "u9" }))).toBe("사용자 #u9");
  });

  it("id조차 없으면 '알 수 없음'", () => {
    expect(versionAuthorName(users, version({ savedBy: "" }))).toBe("알 수 없음");
  });
});
