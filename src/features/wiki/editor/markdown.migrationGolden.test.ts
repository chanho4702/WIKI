import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import basicFormatting from "./__fixtures__/migration-golden/basic-formatting.md?raw";
import tablePanelColumns from "./__fixtures__/migration-golden/table-panel-columns.md?raw";
import opaqueMediaLinks from "./__fixtures__/migration-golden/opaque-media-links.md?raw";

/**
 * 컨플루언스 DC 이관(W29)이 IR에서 만들어 내는 마크다운은 **에디터 왕복의 고정점**이어야 한다 —
 * 옮겨온 문서를 한 번 열어 저장했을 뿐인데 본문이 바뀌면 이관이 실패한 것과 같다.
 * 원본은 wiki-backend `src/test/resources/fixtures/migration/confluence/golden/*.md`
 * (`DocumentIrMarkdownWriterTest`의 출력)이고, 여기 사본은 그 계약을 프론트 쪽에서 고정한다.
 * 백엔드 writer가 바뀌면 두 곳을 함께 갱신한다.
 */
const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();

const GOLDEN: Array<{ name: string; md: string }> = [
  { name: "기본 서식", md: basicFormatting },
  { name: "표·패널·컬럼", md: tablePanelColumns },
  { name: "opaque 매크로·이미지·링크", md: opaqueMediaLinks },
];

describe("이관 골든 마크다운 — 에디터 왕복 고정점", () => {
  it.each(GOLDEN)("$name", ({ md }) => {
    const once = serializeMarkdown(parseMarkdown(md));
    expect(normalize(once)).toBe(normalize(md));
    // 두 번째 왕복도 같아야 "고정점"이다(첫 왕복만 같은 우연을 걸러낸다)
    expect(normalize(serializeMarkdown(parseMarkdown(once)))).toBe(normalize(md));
  });
});
