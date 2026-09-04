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
  // remarkAlerts의 마커 인식에는 영향이 없다 — MarkdownView.test.tsx의
  // "이스케이프 저장형(\[!NOTE\])도 md-alert-note 패널로 렌더한다" 및
  // "비이스케이프 입력이 에디터 왕복(파싱→직렬화) 후에도 패널로 유지된다" 테스트로 실증했다.
  { name: "GitHub-style alert(NOTE)", md: "> \\[!NOTE\\] 내용" },
  // 이모지 피커(W6 T4) — EmojiPicker.select()는 유니코드 문자를 insertContent로 그대로 넣으므로
  // 마크다운 문법 문자가 아닌 일반 텍스트로 직렬화되고, 유니코드 자체가 손실 없이 보존돼야 한다.
  { name: "이모지 포함 문단", md: "오늘 기분 😀 최고! 🎉" },
  // 수식(W27-2) — 편집기는 `$`를 모르는 일반 텍스트로 보존한다(스키마 확장 없음).
  { name: "인라인 수식($…$)", md: "인라인 $a^2 + b^2 = c^2$ 수식" },
  // 블록 수식의 fixed point는 **한 줄**이다: markdown-it이 `$$` / 본문 / `$$` 세 줄을 한 문단으로
  // 읽고 줄바꿈이 softbreak이라 직렬화하면 공백이 된다(alert의 이스케이프 fixed point와 같은 사정).
  // 세 줄로 입력해도 내용은 그대로 남고, 보기 쪽 lib/remarkDisplayMath.ts가 이 한 줄을 다시
  // 블록(display) 수식으로 렌더한다 — MarkdownView.math.test.tsx에서 실증한다.
  { name: "블록 수식($$…$$)", md: "$$ E = mc^2 $$" },
  // Mermaid(W27-2) — 언어가 붙은 코드 블록일 뿐이라 왕복에 손실이 없다
  { name: "Mermaid 코드 블록", md: "```mermaid\ngraph TD;\n  A-->B;\n```" },
  // 콘텐츠 매크로(W27-3) — `::toc`처럼 텍스트 문단으로 남는다. 대괄호는 직렬화기가 이스케이프하므로
  // 그 형태가 fixed point이고, 보기 쪽 remarkContentMacros가 이스케이프 형태도 함께 인식한다.
  { name: "콘텐츠 매크로(라벨별 문서 목록)", md: "::pages-by-label\\[라벨\\]" },
  { name: "콘텐츠 매크로(최근 업데이트)", md: "::recently-updated{limit=5}" },
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
