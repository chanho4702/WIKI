import { describe, expect, it } from "vitest";
import { extractProperties, plainValue } from "./properties";

/** 속성 보고서(W23)가 읽는 페이지 속성 표. */
describe("extractProperties", () => {
  it("첫 :::properties 블록의 행을 키·값으로 읽고 머리글·구분선은 버린다", () => {
    const md = "# 문서\n\n:::properties\n| 항목 | 값 |\n| --- | --- |\n| 담당자 | 김철수 |\n| 상태 | :status[진행 중]{.info} |\n:::\n본문";

    expect(extractProperties(md)).toEqual([
      { key: "담당자", value: "김철수" },
      { key: "상태", value: ":status[진행 중]{.info}" },
    ]);
  });

  it("블록이 없으면 null — 속성이 없는 문서와 빈 표를 구분한다", () => {
    expect(extractProperties("본문뿐")).toBeNull();
    expect(extractProperties(":::properties\n:::")).toEqual([]);
  });

  it("편집기가 이스케이프한 지시자도 읽는다", () => {
    expect(extractProperties("\\:\\:\\:properties\n| 기한 | 9월 |\n\\:\\:\\:")).toEqual([{ key: "기한", value: "9월" }]);
  });

  it("셀 값의 배지·링크·강조는 글자만 남긴다", () => {
    expect(plainValue(":status[완료]{.success}")).toBe("완료");
    expect(plainValue("**[김철수](user:1)**")).toBe("김철수");
  });
});
