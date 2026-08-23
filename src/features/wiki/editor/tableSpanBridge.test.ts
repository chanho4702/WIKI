import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown";

const MERGED = `| 병합 | << | 오른쪽 |
| --- | --- | --- |
| ^^ | ^^ | 값 |
`;

function tableOf(doc: ReturnType<typeof parseMarkdown>) {
  const table = doc.content?.find((n) => n.type === "table");
  expect(table).toBeDefined();
  return table!;
}

describe("tableSpanBridge — 셀 병합 마커 왕복", () => {
  it("`<<`/`^^` 마커가 colspan/rowspan으로 접힌다", () => {
    const table = tableOf(parseMarkdown(MERGED));
    const rows = table.content!;
    // 헤더 행: 병합 셀(2x2) + 오른쪽 — 마커 셀은 사라진다
    expect(rows[0].content).toHaveLength(2);
    expect(rows[0].content![0].attrs).toMatchObject({ colspan: 2, rowspan: 2 });
    // 두 번째 행: 덮인 자리 둘 다 제거되어 "값" 하나만 남는다
    expect(rows[1].content).toHaveLength(1);
  });

  it("직렬화가 마커 그리드를 복원한다 — 왕복 안정", () => {
    const doc = parseMarkdown(MERGED);
    const md = serializeMarkdown(doc);
    // GFM 파이프 구조 유지: 각 행의 셀 수가 같다
    for (const line of md.trim().split("\n")) {
      expect(line.split("|")).toHaveLength(5); // 양끝 빈 조각 포함 3셀
    }
    // 재파싱해도 같은 구조 (직렬화 이스케이프가 있어도 파싱이 해제한다 — 알림 마커와 같은 규약)
    const again = tableOf(parseMarkdown(md));
    expect(again.content![0].content![0].attrs).toMatchObject({ colspan: 2, rowspan: 2 });
    expect(serializeMarkdown(parseMarkdown(md))).toBe(md);
  });

  it("마커 없는 표는 건드리지 않는다", () => {
    const md = "| a | b |\n| --- | --- |\n| c | d |\n";
    const table = tableOf(parseMarkdown(md));
    expect(table.content![0].content).toHaveLength(2);
    expect(table.content![1].content).toHaveLength(2);
  });

  it("왼쪽 이웃이 없는 `<<`는 일반 텍스트로 남는다(문서 훼손 금지)", () => {
    const md = "| << | b |\n| --- | --- |\n| c | d |\n";
    const table = tableOf(parseMarkdown(md));
    expect(table.content![0].content).toHaveLength(2); // 접히지 않음
  });
});
