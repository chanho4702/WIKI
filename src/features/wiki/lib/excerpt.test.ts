import { describe, expect, it } from "vitest";
import { extractExcerpt, normalizeDirectiveEscapes, parseExcerptIncludeTitle } from "./excerpt";

describe("발췌 추출", () => {
  it(":::excerpt 사이를 뽑는다", () => {
    expect(extractExcerpt("앞\n:::excerpt\n요약 한 줄\n\n둘째\n:::\n뒤")).toBe("요약 한 줄\n\n둘째");
  });

  /** 첫 문단으로 대신하지 않는다 — 작성자가 가져다 써도 되는 부분을 정하지 않은 문서다. */
  it("블록이 없으면 null이다", () => {
    expect(extractExcerpt("그냥 본문")).toBeNull();
    expect(extractExcerpt(":::excerpt\n\n:::")).toBeNull();
  });

  it("편집기가 이스케이프한 형태도 읽는다", () => {
    expect(extractExcerpt("\\:\\:\\:excerpt\n요약\n\\:\\:\\:")).toBe("요약");
  });

  /** 줄 전체가 지시자일 때만 푼다 — 본문의 리터럴 `\:`를 건드리면 안 된다. */
  it("지시자 줄이 아닌 이스케이프는 그대로 둔다", () => {
    expect(normalizeDirectiveEscapes("시간은 12\\:30")).toBe("시간은 12\\:30");
    expect(normalizeDirectiveEscapes("\\:\\:excerpt-include[회고]")).toBe("::excerpt-include[회고]");
  });

  it("포함 지시자의 제목을 읽는다", () => {
    expect(parseExcerptIncludeTitle("::excerpt-include[ 팀 규칙 ]")).toBe("팀 규칙");
    expect(parseExcerptIncludeTitle("::excerpt-include[]")).toBeNull();
    expect(parseExcerptIncludeTitle("::toc")).toBeNull();
  });
});
