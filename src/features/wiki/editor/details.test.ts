import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { DETAILS_NAME, sanitizeSummary } from "./extensions/details";

const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();
const roundtrip = (md: string) => normalize(serializeMarkdown(parseMarkdown(md)));

/**
 * 토글 저장 포맷(`:::details[제목]`) 계약 — 왕복이 깨지면 저장할 때마다 문서가 망가진다.
 * 문법 결정 근거: docs/roadmap/2026-08-23-editor-notion-confluence-parity.md §5 (A안).
 */
describe("토글 — 마크다운 왕복", () => {
  it("제목 있는 토글이 문자 단위로 보존된다", () => {
    const md = [":::details[릴리스 노트]", "숨긴 내용", ":::"].join("\n");
    expect(roundtrip(md)).toBe(md);
  });

  it("제목 없는 토글은 라벨 없이 저장된다", () => {
    const md = [":::details", "내용", ":::"].join("\n");
    expect(roundtrip(md)).toBe(md);
  });

  it("여러 블록(목록·코드)을 품어도 보존된다", () => {
    const md = [
      ":::details[체크리스트]",
      "- 하나",
      "- 둘",
      "",
      "```js",
      "const a = 1;",
      "```",
      ":::",
    ].join("\n");
    expect(roundtrip(md)).toBe(md);
  });

  it("파싱 결과가 detailsBlock 노드다(문단으로 새지 않는다)", () => {
    const doc = parseMarkdown([":::details[제목]", "내용", ":::"].join("\n"));
    const first = (doc.content as Array<{ type: string; attrs?: { summary?: string } }>)[0];
    expect(first.type).toBe(DETAILS_NAME);
    expect(first.attrs?.summary).toBe("제목");
  });

  it("토글 속 토글 — 바깥 마커가 자동으로 길어진다(::::)", () => {
    // 문단과 다음 블록 사이 빈 줄은 마크다운 표준 구분 — 직렬화가 이 형태로 정규화하고 이후 안정이다.
    const md = [
      "::::details[바깥]",
      "앞 내용",
      "",
      ":::details[안쪽]",
      "안쪽 내용",
      ":::",
      "::::",
    ].join("\n");
    expect(roundtrip(md)).toBe(md);
    expect(roundtrip(md.replace("앞 내용\n\n", "앞 내용\n"))).toBe(md);
  });

  it("토글 속 컬럼 — 토글 마커가 컬럼(::::)보다 길어진다(:::::)", () => {
    const md = [
      ":::::details[레이아웃 포함]",
      "::::columns",
      ":::column",
      "왼쪽",
      ":::",
      ":::column",
      "오른쪽",
      ":::",
      "::::",
      ":::::",
    ].join("\n");
    expect(roundtrip(md)).toBe(md);
  });

  it("컬럼 속 토글 — 토글을 품은 열만 마커가 길어진다", () => {
    const md = [
      ":::::columns",
      "::::column",
      ":::details[열 안 토글]",
      "내용",
      ":::",
      "::::",
      ":::column",
      "오른쪽",
      ":::",
      ":::::",
    ].join("\n");
    // 마커는 노드별 최소로 계산된다 — 토글 없는 오른쪽 열은 3 그대로. 왕복은 안정이다.
    expect(roundtrip(md)).toBe(md);

    // 균일하게 길게 쓴 입력도 같은 구조로 읽히고 최소형으로 정규화된다(한 번 저장 후 안정).
    const uniform = md.replace(":::column\n오른쪽\n:::", "::::column\n오른쪽\n::::");
    expect(roundtrip(uniform)).toBe(md);
  });

  it("중첩 없는 기존 컬럼 문서의 직렬화는 바뀌지 않는다(회귀 가드)", () => {
    const md = [
      "::::columns",
      ":::column",
      "왼쪽",
      ":::",
      ":::column",
      "오른쪽",
      ":::",
      "::::",
    ].join("\n");
    expect(roundtrip(md)).toBe(md);
  });
});

describe("sanitizeSummary — 제목 문법 충돌 방지", () => {
  it("대괄호와 개행을 걷어낸다", () => {
    expect(sanitizeSummary("제[목]\n둘째 줄")).toBe("제목 둘째 줄");
  });

  it("직렬화 시 제목의 대괄호가 라벨을 깨뜨리지 않는다", () => {
    const doc = parseMarkdown([":::details", "내용", ":::"].join("\n"));
    (doc.content as Array<{ attrs?: Record<string, unknown> }>)[0].attrs = {
      summary: "위험]한[제목",
    };
    const md = normalize(serializeMarkdown(doc));
    expect(md.split("\n")[0]).toBe(":::details[위험한제목]");
    // 다시 읽어도 같은 구조
    expect(roundtrip(md)).toBe(md);
  });
});
