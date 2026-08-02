import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { buildBaseExtensions } from "./extensions/base";
import { COLUMN_NAME, SUPPORTED_COLUMN_COUNTS } from "./extensions/columns";

const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();
const roundtrip = (md: string) => normalize(serializeMarkdown(parseMarkdown(md)));

/** N열 마크다운 — 열마다 내용을 달리 둬야 열이 뒤섞이거나 합쳐진 걸 잡아낸다. */
const columnsMarkdown = (count: number) =>
  [
    "::::columns",
    ...Array.from({ length: count }, (_, i) => [":::column", `내용 ${i + 1}`, ":::"]).flat(),
    "::::",
  ].join("\n");

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

  // 1·4·5열 확장(기획 A1) — 예전엔 2·3열만 검증돼 있어서 "왕복이 된다"고 말할 근거가 없었다.
  it.each(SUPPORTED_COLUMN_COUNTS)("%i열 레이아웃이 문자 단위로 보존된다", (count) => {
    const md = columnsMarkdown(count);
    expect(roundtrip(md)).toBe(md);
  });

  // 열 너비(기획: 사용자 요청) — 레이아웃은 문서의 일부라 뷰어 설정이 아니라 본문에 저장한다
  it("열 너비가 `{width=N}`으로 저장되고 그대로 복원된다", () => {
    const md = [
      "::::columns",
      ":::column{width=30}",
      "왼쪽",
      ":::",
      ":::column{width=70}",
      "오른쪽",
      ":::",
      "::::",
    ].join("\n");
    expect(roundtrip(md)).toBe(md);

    const block = parseMarkdown(md).content?.[0];
    expect(block?.content?.map((c) => c.attrs?.width)).toEqual([30, 70]);
  });

  it("너비가 없는 열은 속성 없이 직렬화된다 — 기존 문서가 바뀌지 않는다", () => {
    // 회귀 가드: 너비 기능을 넣었다고 기존 2·3열 문서의 저장 문자열이 달라지면 안 된다
    expect(roundtrip(TWO_COLUMNS)).toBe(TWO_COLUMNS);
    const block = parseMarkdown(TWO_COLUMNS).content?.[0];
    expect(block?.content?.map((c) => c.attrs?.width)).toEqual([null, null]);
  });

  it("범위를 벗어난 너비는 무시하고 균등 분배로 떨어진다", () => {
    const md = ["::::columns", ":::column{width=0}", "a", ":::", ":::column{width=150}", "b", ":::", "::::"].join("\n");
    const block = parseMarkdown(md).content?.[0];
    expect(block?.content?.map((c) => c.attrs?.width)).toEqual([null, null]);
  });

  it("열 개수가 자식 :::column 수로 그대로 읽힌다", () => {
    for (const count of SUPPORTED_COLUMN_COUNTS) {
      const block = parseMarkdown(columnsMarkdown(count)).content?.[0];
      expect(block?.type).toBe("columnBlock");
      expect(block?.content).toHaveLength(count);
    }
  });
});

/**
 * setColumns 명령의 커서 위치 — 브라우저에서 실제로 잡힌 회귀다. 삽입 직후 커서는 레이아웃의
 * 끝(마지막 열)에 놓여서, 2열을 만들면 오른쪽 열부터 타이핑되고 있었다.
 * 직렬화 결과만 검증하던 위 테스트들은 이 문제를 잡지 못했다.
 */
describe("레이어 분할 — 삽입 직후 커서", () => {
  const withEditor = (fn: (editor: Editor) => void) => {
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("") });
    try {
      fn(editor);
    } finally {
      editor.destroy();
    }
  };

  it("2열을 만들면 커서가 첫 번째 열 안에 놓인다", () => {
    withEditor((editor) => {
      editor.commands.setColumns(2);
      const $pos = editor.state.selection.$from;
      // 커서를 감싼 조상 중 column을 찾아, 그게 부모(columnBlock)의 첫 자식인지 본다
      let columnDepth: number | null = null;
      for (let d = $pos.depth; d > 0; d -= 1) {
        if ($pos.node(d).type.name === COLUMN_NAME) {
          columnDepth = d;
          break;
        }
      }
      expect(columnDepth).not.toBeNull();
      expect($pos.index(columnDepth! - 1)).toBe(0); // 첫 번째 열
    });
  });

  it("타이핑한 내용이 오른쪽이 아니라 왼쪽 열에 들어간다", () => {
    withEditor((editor) => {
      editor.commands.setColumns(2);
      editor.commands.insertContent("왼쪽부터");
      const md = serializeMarkdown(editor.getJSON());
      expect(md).toContain([":::column", "왼쪽부터", ":::"].join("\n"));
    });
  });

  it("지원 범위 밖 열 수는 잘라낸다 — 문서에 6열이 저장되는 경로를 만들지 않는다", () => {
    withEditor((editor) => {
      editor.commands.setColumns(9);
      const lines = serializeMarkdown(editor.getJSON()).trim().split("\n");
      expect(lines.filter((l) => l === ":::column")).toHaveLength(5);
    });
    withEditor((editor) => {
      editor.commands.setColumns(0);
      const lines = serializeMarkdown(editor.getJSON()).trim().split("\n");
      expect(lines.filter((l) => l === ":::column")).toHaveLength(1);
    });
  });

  it("3열에서도 첫 번째 열에 놓인다", () => {
    withEditor((editor) => {
      editor.commands.setColumns(3);
      editor.commands.insertContent("첫칸");
      // 줄 단위로 본다 — `::::columns`가 `:::column`을 부분 문자열로 포함하므로
      // 문자열 split으로 열을 가르면 바깥 마커까지 잘린다.
      const lines = serializeMarkdown(editor.getJSON()).trim().split("\n");
      const firstColumnStart = lines.indexOf(":::column");
      expect(firstColumnStart).toBeGreaterThan(-1);
      expect(lines[firstColumnStart + 1]).toBe("첫칸");
    });
  });
});

/**
 * 열 수 변경(기획 A3). 1열은 그 자체로 쓸모가 있다기보다 여기서 열 수를 바꾸는 시작점이라
 * 이 명령이 없으면 1열을 넣을 이유가 없다(기획 P2).
 *
 * 가장 중요한 계약은 **줄일 때 내용을 잃지 않는 것**이다 — 그냥 버리면 3열로 쓰다 2열로 바꾼
 * 순간 오른쪽 내용이 조용히 사라지고 되돌릴 수 없다.
 */
describe("레이어 분할 — 열 수 변경", () => {
  const editorWith = (md: string) =>
    new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown(md) });

  const columnLines = (editor: Editor) =>
    serializeMarkdown(editor.getJSON())
      .trim()
      .split("\n")
      .filter((l) => l === ":::column");

  it("늘리면 빈 열이 뒤에 붙고 기존 내용은 그대로다", () => {
    const editor = editorWith(columnsMarkdown(2));
    try {
      editor.commands.setTextSelection(3); // 첫 열 안
      editor.commands.setColumnCount(4);
      expect(columnLines(editor)).toHaveLength(4);
      const md = serializeMarkdown(editor.getJSON());
      expect(md).toContain("내용 1");
      expect(md).toContain("내용 2");
    } finally {
      editor.destroy();
    }
  });

  it("줄이면 잘린 열의 내용이 마지막 남는 열로 합쳐진다 — 사라지지 않는다", () => {
    const editor = editorWith(columnsMarkdown(3));
    try {
      editor.commands.setTextSelection(3);
      editor.commands.setColumnCount(2);
      expect(columnLines(editor)).toHaveLength(2);
      const md = serializeMarkdown(editor.getJSON());
      // 3열의 "내용 3"이 버려지지 않고 남아 있어야 한다
      expect(md).toContain("내용 1");
      expect(md).toContain("내용 2");
      expect(md).toContain("내용 3");
    } finally {
      editor.destroy();
    }
  });

  it("1열로 줄여도 전체 내용이 한 열에 남는다", () => {
    const editor = editorWith(columnsMarkdown(3));
    try {
      editor.commands.setTextSelection(3);
      editor.commands.setColumnCount(1);
      expect(columnLines(editor)).toHaveLength(1);
      const md = serializeMarkdown(editor.getJSON());
      for (const text of ["내용 1", "내용 2", "내용 3"]) expect(md).toContain(text);
    } finally {
      editor.destroy();
    }
  });

  it("레이아웃 밖에서 부르면 아무것도 하지 않는다", () => {
    const editor = editorWith("그냥 문단");
    try {
      expect(editor.commands.setColumnCount(3)).toBe(false);
    } finally {
      editor.destroy();
    }
  });
});
