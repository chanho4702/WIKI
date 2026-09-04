import { describe, expect, it } from "vitest";
import { defaultVerifiedUntil, todayIso, verificationState } from "./verification";

describe("verificationState", () => {
  it("유효기간이 없으면 배지를 달지 않는다", () => {
    expect(verificationState({ verifiedUntil: null }, "2026-09-04")).toBe("none");
    expect(verificationState({ verifiedUntil: undefined }, "2026-09-04")).toBe("none");
  });

  it("유효기간 당일까지는 유효하다", () => {
    expect(verificationState({ verifiedUntil: "2026-09-04" }, "2026-09-04")).toBe("verified");
    expect(verificationState({ verifiedUntil: "2026-12-03" }, "2026-09-04")).toBe("verified");
  });

  it("유효기간 다음 날부터 만료다", () => {
    expect(verificationState({ verifiedUntil: "2026-09-03" }, "2026-09-04")).toBe("expired");
    expect(verificationState({ verifiedUntil: "2020-01-01" }, "2026-09-04")).toBe("expired");
  });
});

describe("todayIso", () => {
  // toISOString()을 쓰면 한국 시간 저녁에 UTC 날짜가 하루 뒤처져 오늘 검증한 문서가 만료로 보인다
  it("UTC가 아니라 로컬 날짜를 준다", () => {
    const 늦은밤 = new Date(2026, 8, 4, 23, 30);
    expect(todayIso(늦은밤)).toBe("2026-09-04");
  });

  it("월·일을 두 자리로 채운다", () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("defaultVerifiedUntil", () => {
  it("기본 유효기간은 90일 뒤다", () => {
    expect(defaultVerifiedUntil(new Date(2026, 8, 4))).toBe("2026-12-03");
  });
});
