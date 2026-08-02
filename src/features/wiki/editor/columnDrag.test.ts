import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { buildBaseExtensions } from "./extensions/base";
import { ColumnDrag, moveColumn } from "./extensions/columnDrag";

/**
 * 드래그 상호작용의 **결과**를 검증한다.
 *
 * 포인터 드래그 자체(pointerdown→move→up과 getBoundingClientRect 기반 위치 판정)는 jsdom이
 * 레이아웃을 계산하지 않아 재현할 수 없다 — 그 부분은 실브라우저 확인 항목으로 남기고,
 * 여기서는 드래그가 끝난 뒤 문서에 무엇이 남는지(순서·너비·직렬화)를 고정한다.
 */
const columnsMd = (cols: Array<{ text: string; width?: number }>) =>
  [
    "::::columns",
    ...cols
      .map((c) => [c.width == null ? ":::column" : `:::column{width=${c.width}}`, c.text, ":::"])
      .flat(),
    "::::",
  ].join("\n");

function makeEditor(md: string) {
  return new Editor({
    extensions: [...buildBaseExtensions(), ColumnDrag],
    content: parseMarkdown(md),
  });
}

/** 문서에서 columnBlock의 위치를 찾는다. */
function blockPos(editor: Editor): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === "columnBlock") found = pos;
    return found < 0;
  });
  return found;
}

describe("열 재배치 (moveColumn)", () => {
  it("열 순서를 바꾸면 내용과 너비가 함께 따라간다", () => {
    // 너비만 남고 내용이 안 따라가면 배치가 뒤바뀐 것처럼 보인다 — 그게 이 테스트의 이유다
    const editor = makeEditor(
      columnsMd([
        { text: "첫째", width: 20 },
        { text: "둘째", width: 30 },
        { text: "셋째", width: 50 },
      ]),
    );
    try {
      expect(moveColumn(editor.view, blockPos(editor), 0, 2)).toBe(true);
      const md = serializeMarkdown(editor.getJSON());
      const lines = md.trim().split("\n");
      // 첫째가 마지막으로 갔고, 너비 20도 함께 갔다
      expect(lines.filter((l) => l.startsWith(":::column"))).toEqual([
        ":::column{width=30}",
        ":::column{width=50}",
        ":::column{width=20}",
      ]);
      expect(md.indexOf("둘째")).toBeLessThan(md.indexOf("첫째"));
      expect(md.indexOf("셋째")).toBeLessThan(md.indexOf("첫째"));
    } finally {
      editor.destroy();
    }
  });

  it("같은 자리로 옮기거나 범위를 벗어나면 아무것도 하지 않는다", () => {
    const editor = makeEditor(columnsMd([{ text: "a" }, { text: "b" }]));
    try {
      const pos = blockPos(editor);
      expect(moveColumn(editor.view, pos, 1, 1)).toBe(false);
      expect(moveColumn(editor.view, pos, 0, 5)).toBe(false);
      expect(moveColumn(editor.view, pos, -1, 0)).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("레이아웃이 아닌 위치를 주면 false다", () => {
    const editor = makeEditor("그냥 문단");
    try {
      expect(moveColumn(editor.view, 0, 0, 1)).toBe(false);
    } finally {
      editor.destroy();
    }
  });
});

/**
 * 드롭 판정의 위치 계산 회귀.
 *
 * Codex 교차검증에서 잡힌 Critical: `posAtCoords().inside`를 쓰면 그 값이 블록 **앞** 위치라
 * `resolve` 시 depth가 0이 되고, 최상위 문단·제목이 전부 걸러져 끌어서 분할이 가장 흔한
 * 경우에 동작하지 않았다. jsdom은 좌표를 계산하지 못해 `posAtCoords`를 직접 부를 수 없으므로,
 * 그 판정이 의존하는 **문서 위치 해석**을 같은 방식으로 검증한다.
 */
describe("드롭 대상 위치 해석", () => {
  it("문단 안쪽 위치에서 최상위 블록 시작점을 얻는다", () => {
    const editor = makeEditor("첫 문단\n\n둘째 문단");
    try {
      const doc = editor.state.doc;
      // 첫 문단 텍스트 안의 위치(= posAtCoords가 주는 pos)
      const $inside = doc.resolve(2);
      expect($inside.depth).toBeGreaterThanOrEqual(1);
      const blockPos = $inside.before(1);
      expect(doc.nodeAt(blockPos)?.type.name).toBe("paragraph");
      expect(doc.nodeAt(blockPos)?.textContent).toBe("첫 문단");
    } finally {
      editor.destroy();
    }
  });

  it("블록 '앞' 위치(inside)는 depth 0이라 그대로 쓰면 안 된다", () => {
    // 이 성질이 Critical의 원인이었다 — 회귀로 고정해 둔다
    const editor = makeEditor("첫 문단\n\n둘째 문단");
    try {
      const $before = editor.state.doc.resolve(0);
      expect($before.depth).toBe(0);
    } finally {
      editor.destroy();
    }
  });
});

describe("열 너비 설정 (setColumnWidths)", () => {
  it("너비가 문서에 저장돼 직렬화된다", () => {
    const editor = makeEditor(columnsMd([{ text: "왼쪽" }, { text: "오른쪽" }]));
    try {
      expect(editor.commands.setColumnWidths(blockPos(editor), [35, 65])).toBe(true);
      const md = serializeMarkdown(editor.getJSON());
      expect(md).toContain(":::column{width=35}");
      expect(md).toContain(":::column{width=65}");
    } finally {
      editor.destroy();
    }
  });

  it("열 수와 너비 개수가 다르면 거부한다", () => {
    const editor = makeEditor(columnsMd([{ text: "a" }, { text: "b" }]));
    try {
      expect(editor.commands.setColumnWidths(blockPos(editor), [50, 30, 20])).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("범위를 벗어난 값은 null로 떨어져 균등 분배로 돌아간다", () => {
    const editor = makeEditor(columnsMd([{ text: "a", width: 40 }, { text: "b", width: 60 }]));
    try {
      editor.commands.setColumnWidths(blockPos(editor), [0, 100]);
      const md = serializeMarkdown(editor.getJSON());
      expect(md).not.toContain("width=");
    } finally {
      editor.destroy();
    }
  });
});
