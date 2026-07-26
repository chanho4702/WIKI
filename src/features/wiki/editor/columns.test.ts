import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown";

const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();
const roundtrip = (md: string) => normalize(serializeMarkdown(parseMarkdown(md)));

const TWO_COLUMNS = [
  "::::columns",
  ":::column",
  "왼쪽 내용",
  ":::",
  ":::column",
  "오른쪽 내용",
  ":::",
  "::::",
].join("\n");

/**
 * 레이어 분할 저장 포맷(`:::` 확장 문법) 계약.
 * 결정 근거는 `docs/roadmap/2026-07-26-folder-and-editor-layout.md` §5.
 * 왕복이 깨지면 저장할 때마다 문서가 조금씩 망가지므로, 이 파일이 그 회귀를 막는 1차 방어선이다.
 */
describe("레이어 분할 — 마크다운 왕복", () => {
  it("2열 레이아웃이 문자 단위로 그대로 보존된다", () => {
    expect(roundtrip(TWO_COLUMNS)).toBe(TWO_COLUMNS);
  });

  it("3열도 보존된다", () => {
    const md = [
      "::::columns",
      ":::column",
      "하나",
      ":::",
      ":::column",
      "둘",
      ":::",
      ":::column",
      "셋",
      ":::",
      "::::",
    ].join("\n");
    expect(roundtrip(md)).toBe(md);
  });

  it("열 안에 제목·목록 같은 블록을 넣어도 구조가 유지된다", () => {
    const md = [
      "::::columns",
      ":::column",
      "## 왼쪽 제목",
      "",
      "- 항목 1",
      "- 항목 2",
      ":::",
      ":::column",
      "오른쪽 문단",
      ":::",
      "::::",
    ].join("\n");
    expect(roundtrip(md)).toBe(md);
  });

  it("레이아웃 앞뒤의 일반 본문과 섞여도 서로 침범하지 않는다", () => {
    const md = ["앞 문단", "", TWO_COLUMNS, "", "뒤 문단"].join("\n");
    expect(roundtrip(md)).toBe(md);
  });

  it("파싱 결과가 columnBlock > column 계층이다", () => {
    const doc = parseMarkdown(TWO_COLUMNS);
    const block = doc.content?.[0];
    expect(block?.type).toBe("columnBlock");
    expect(block?.content?.map((c) => c.type)).toEqual(["column", "column"]);
    // 열 개수 세는 규칙이 깨지면 3열이 2열로 붙는 식의 조용한 손실이 난다
    expect(block?.content?.[0].content?.[0].content?.[0].text).toBe("왼쪽 내용");
  });

  it("바깥 마커가 더 길어야 중첩이 성립한다 — 안쪽 :::가 바깥을 먼저 닫지 않는다", () => {
    const doc = parseMarkdown(TWO_COLUMNS);
    // 바깥을 안쪽이 닫아버리면 columnBlock 뒤에 "::::" 텍스트 문단이 남는다(초기 구현의 실제 버그)
    expect(doc.content).toHaveLength(1);
  });

  it("닫는 줄이 없어도 문서 끝에서 닫아 내용을 잃지 않는다", () => {
    const doc = parseMarkdown("::::columns\n:::column\n안 닫힌 열");
    const block = doc.content?.[0];
    expect(block?.type).toBe("columnBlock");
    expect(JSON.stringify(block)).toContain("안 닫힌 열");
  });

  it("컬럼이 없는 기존 문서는 영향을 받지 않는다", () => {
    const md = "# 제목\n\n일반 문단입니다.\n\n- 항목";
    expect(roundtrip(md)).toBe(md);
  });
});
