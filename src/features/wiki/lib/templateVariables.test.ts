import { describe, expect, it } from "vitest";
import { applyTemplateVariables, todayIso } from "./templateVariables";

const VARS = { date: "2026-09-04", author: "김철수", space: "개발 위키" };

describe("applyTemplateVariables", () => {
  it("세 변수를 치환한다", () => {
    expect(applyTemplateVariables("{{date}} / {{author}} / {{space}}", VARS)).toBe(
      "2026-09-04 / 김철수 / 개발 위키",
    );
  });

  it("같은 변수가 여러 번 나와도 모두 치환한다", () => {
    expect(applyTemplateVariables("{{author}}와 {{author}}", VARS)).toBe("김철수와 김철수");
  });

  it("중괄호 안 공백도 받는다", () => {
    expect(applyTemplateVariables("{{ date }}", VARS)).toBe("2026-09-04");
  });

  /** 오타를 조용히 삼키면 작성자가 알아챌 방법이 없다. */
  it("모르는 변수는 그대로 남긴다", () => {
    expect(applyTemplateVariables("{{title}} {{누구}}", VARS)).toBe("{{title}} {{누구}}");
  });

  it("값이 비면 빈 문자열로 치환한다", () => {
    expect(applyTemplateVariables("작성자: {{author}}.", { ...VARS, author: "" })).toBe("작성자: .");
  });

  it("변수가 없는 본문은 그대로다", () => {
    const md = "## 안건\n\n- 하나";
    expect(applyTemplateVariables(md, VARS)).toBe(md);
  });
});

describe("todayIso", () => {
  it("로컬 달력 기준 YYYY-MM-DD를 만든다", () => {
    // UTC로 바꾸면 날짜가 밀리는 시각(한국 시간 오전 8시 = 전날 23시 UTC)
    expect(todayIso(new Date(2026, 8, 4, 8, 0, 0))).toBe("2026-09-04");
  });

  it("월·일을 두 자리로 채운다", () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
