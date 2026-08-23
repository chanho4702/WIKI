import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown";

const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();
const roundtrip = (md: string) => normalize(serializeMarkdown(parseMarkdown(md)));

/**
 * 이미지 폭·캡션은 표준 마크다운 표기(src 프래그먼트 + title)에 싣는다 — 왕복 코드 변경이
 * 없어야 한다는 것이 이 방식의 존재 이유다. 여기서 그 가정을 고정한다.
 */
describe("이미지 폭·캡션 — 표준 마크다운 왕복", () => {
  it("`#w=` 프래그먼트가 있는 src가 그대로 보존된다", () => {
    const md = "![스크린샷](/api/wiki/attachments/7/inline#w=480)";
    expect(roundtrip(md)).toBe(md);
  });

  it("캡션(title)이 그대로 보존된다", () => {
    const md = '![대체 텍스트](/api/wiki/attachments/7/inline#w=320 "배포 구조도")';
    expect(roundtrip(md)).toBe(md);
  });

  it("폭·캡션이 없는 기존 이미지는 영향이 없다(회귀 가드)", () => {
    const md = "![기존](https://example.com/a.png)";
    expect(roundtrip(md)).toBe(md);
  });
});

describe("체크리스트 중첩 — 동등성 Must 6", () => {
  it("하위 체크 항목이 구조를 유지한 채 왕복된다", () => {
    // 직렬화는 항목 사이에 빈 줄을 두는 loose 형식으로 정규화한다(평면 체크리스트도 동일) —
    // 한 번 저장 후 안정이면 계약 충족이다.
    const compact = ["- [ ] 상위 작업", "  - [ ] 하위 작업", "  - [x] 끝난 하위 작업"].join("\n");
    const loose = ["- [ ] 상위 작업", "", "  - [ ] 하위 작업", "", "  - [x] 끝난 하위 작업"].join("\n");
    expect(roundtrip(compact)).toBe(loose);
    expect(roundtrip(loose)).toBe(loose);
  });

  it("파싱 결과가 taskList 안의 taskList다(일반 목록으로 새지 않는다)", () => {
    const doc = parseMarkdown(["- [ ] 상위", "  - [ ] 하위"].join("\n"));
    const json = JSON.stringify(doc);
    // 상위 taskItem 안에 taskList가 다시 나타나야 중첩이다
    expect(json.match(/"taskList"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
