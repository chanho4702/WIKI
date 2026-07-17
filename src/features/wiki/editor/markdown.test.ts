import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown";

/** 개행 정규화 — 왕복 판정은 이 수준의 차이만 허용한다 */
const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();

/** 케이스 원문은 tiptap-markdown 직렬화 방언(- 불릿, 1. 번호, ``` 펜스)에 맞춰 작성한다 */
const CASES: Array<{ name: string; md: string }> = [
  { name: "문단", md: "안녕하세요.\n\n두 번째 문단입니다." },
  { name: "제목 1~3", md: "# 제목1\n\n## 제목2\n\n### 제목3" },
  { name: "글머리 목록", md: "- 하나\n- 둘\n- 셋" },
  { name: "중첩 목록", md: "- 상위\n  - 하위\n  - 하위2" },
  { name: "번호 목록", md: "1. 첫째\n2. 둘째" },
  // tiptap-markdown은 태스크 리스트를 loose list(항목 사이 빈 줄)로 직렬화한다 — 의미 손실 아님
  { name: "체크박스", md: "- [ ] 할 일\n\n- [x] 완료한 일" },
  { name: "인용", md: "> 인용문입니다." },
  { name: "코드 블록 언어", md: "```ts\nconst a = 1;\n```" },
  { name: "구분선", md: "위\n\n---\n\n아래" },
  {
    name: "표",
    md: "| 이름 | 값 |\n| --- | --- |\n| 가 | 1 |\n| 나 | 2 |",
  },
  { name: "이미지", md: "![대체텍스트](https://example.com/a.png)" },
  { name: "인라인 서식", md: "**굵게** *기울임* ~~취소~~ `코드` [링크](https://example.com)" },
  // GitHub-style alerts(Task 14) — 저장 문법은 순수 blockquote일 뿐 신규 노드가 아니다.
  // tiptap-markdown 직렬화기가 "["를 링크 문법과의 혼동 방지를 위해 "\["로 이스케이프하므로
  // 원문 케이스도 이스케이프된 형태로 고정한다(이스케이프 형태가 parse↔serialize의 fixed point —
  // 이스케이프 없는 "[!NOTE]"로 입력해도 직렬화 결과는 항상 이스케이프된 형태가 된다).
  // remark-parse(렌더 경로)는 백슬래시 이스케이프를 파싱 시점에 리터럴로 되돌리므로
  // remarkAlerts의 마커 인식에는 영향이 없다(MarkdownView.test.tsx에서 별도 확인).
  { name: "GitHub-style alert(NOTE)", md: "> \\[!NOTE\\] 내용" },
];

describe("markdown 왕복", () => {
  it.each(CASES)("$name", ({ md }) => {
    const doc = parseMarkdown(md);
    expect(normalize(serializeMarkdown(doc))).toBe(normalize(md));
  });

  it("모르는 구문(생 HTML)은 내용이 보존된다", () => {
    const md = "<div>원문</div>";
    const out = serializeMarkdown(parseMarkdown(md));
    expect(out).toContain("원문");
  });
});
