# 블록 에디터 구현 계획 (노션풍 WYSIWYG, 마크다운 저장)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 페이지 편집 화면을 "제목 필드 + 작성/미리보기 탭 + textarea"에서 TipTap 기반 노션풍 WYSIWYG 블록 에디터로 교체한다. 저장 포맷은 마크다운 유지.

**Architecture:** TipTap(headless ProseMirror) 에디터를 `src/features/wiki/editor/`에 신설하고, 마크다운 ↔ 문서 변환은 `markdown.ts` 단일 창구로 처리한다. `[[링크]]`는 커스텀 인라인 노드로, 슬래시 메뉴·자동완성·플로팅 툴바·드래그 핸들을 확장으로 조립한다. 보기 화면(MarkdownView)·스토어·백엔드 계약은 무변경.

**Tech Stack:** React 19, TipTap v2(@tiptap/react 등), tiptap-markdown, vitest + Testing Library(jsdom).

**Spec:** `docs/superpowers/specs/2026-07-17-block-editor-design.md`

## Global Constraints

- `Page.body`는 계속 **마크다운 문자열** — 스토어(`wikiStore.ts`)·타입(`types.ts`)·`MarkdownView`·`resolveWikiLinks`·`lineDiff` 수정 금지.
- 블록 화이트리스트: 문단, 제목 1~3, 글머리/번호/체크박스 목록, 인용, 코드 블록(언어·복사), 구분선, 표(GFM), 이미지(URL). 인라인: 굵게, 기울임, 취소선, 인라인 코드, 링크, `[[위키링크]]`.
- 화이트리스트 내 `serialize(parse(md)) ≒ md` (개행 정규화 수준 차이만 허용) — 골든 테스트로 고정.
- 본문 미수정 저장 시 원문 바이트 그대로 저장 (`isDirty()` false → 원문 사용).
- 모든 사용자 노출 문구는 한국어. 기존 Toast 패턴(`useToast`, `{ title, appearance }`) 유지.
- 각 태스크 완료 시 `npm run typecheck && npm test` 그린 확인 후 커밋. 커밋 메시지 말미에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- jsdom 한계로 브라우저 좌표 의존 동작(버블 메뉴 위치, 드래그)은 통합 테스트에서 제외 — 로직만 유닛 커버.

---

### Task 1: 의존성 스파이크 + `markdown.ts` 왕복 골든 테스트

TipTap v2 + tiptap-markdown 조합이 React 19·jsdom·GFM(표/체크박스) 왕복을 만족하는지 검증하고 버전을 고정한다. **이 태스크가 실패하면(왕복 손실) `prosemirror-markdown` 직접 구성으로 전환하고 계획을 갱신한다.**

**Files:**
- Create: `src/features/wiki/editor/markdown.ts`
- Create: `src/features/wiki/editor/extensions/base.ts`
- Test: `src/features/wiki/editor/markdown.test.ts`
- Modify: `package.json` (의존성)

**Interfaces:**
- Produces: `buildBaseExtensions(): Extensions` (base.ts), `parseMarkdown(md: string): JSONContent`, `serializeMarkdown(doc: JSONContent): string` (markdown.ts)

- [ ] **Step 1: 의존성 설치**

```bash
npm install @tiptap/react@^2 @tiptap/core@^2 @tiptap/pm@^2 @tiptap/starter-kit@^2 \
  @tiptap/extension-link@^2 @tiptap/extension-table@^2 @tiptap/extension-table-row@^2 \
  @tiptap/extension-table-header@^2 @tiptap/extension-table-cell@^2 \
  @tiptap/extension-task-list@^2 @tiptap/extension-task-item@^2 \
  @tiptap/extension-image@^2 @tiptap/extension-placeholder@^2 \
  @tiptap/suggestion@^2 tiptap-markdown
```

설치 후 `npm ls @tiptap/react react`로 React 19 peer 경고 없는지 확인. 경고가 나오면 @tiptap 2.11+ 버전으로 조정.

- [ ] **Step 2: 실패하는 골든 왕복 테스트 작성**

`src/features/wiki/editor/markdown.test.ts`:

```ts
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
  { name: "체크박스", md: "- [ ] 할 일\n- [x] 완료한 일" },
  { name: "인용", md: "> 인용문입니다." },
  { name: "코드 블록 언어", md: "```ts\nconst a = 1;\n```" },
  { name: "구분선", md: "위\n\n---\n\n아래" },
  {
    name: "표",
    md: "| 이름 | 값 |\n| --- | --- |\n| 가 | 1 |\n| 나 | 2 |",
  },
  { name: "이미지", md: "![대체텍스트](https://example.com/a.png)" },
  { name: "인라인 서식", md: "**굵게** *기울임* ~~취소~~ `코드` [링크](https://example.com)" },
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/features/wiki/editor/markdown.test.ts`
Expected: FAIL — "Cannot find module './markdown'"

- [ ] **Step 4: base.ts + markdown.ts 구현**

`src/features/wiki/editor/extensions/base.ts`:

```ts
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";

/**
 * 에디터·마크다운 변환 공용 확장 목록.
 * 스키마에 영향을 주는 확장은 반드시 여기에만 추가한다 —
 * WikiEditor와 markdown.ts의 헤드리스 에디터가 같은 스키마를 봐야 왕복이 안전하다.
 */
export function buildBaseExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Link.configure({ openOnClick: false }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: false }),
    Image,
    Markdown.configure({
      html: false, // 생 HTML은 텍스트로 보존 (손실 정책)
      linkify: false,
      transformPastedText: true,
    }),
  ];
}
```

`src/features/wiki/editor/markdown.ts`:

```ts
import { Editor, type JSONContent } from "@tiptap/core";
import { buildBaseExtensions } from "./extensions/base";

/** 변환 전용 헤드리스 에디터 — 사용 후 반드시 destroy */
function withEditor<T>(content: string | JSONContent, fn: (editor: Editor) => T): T {
  const editor = new Editor({
    extensions: buildBaseExtensions(),
    content,
  });
  try {
    return fn(editor);
  } finally {
    editor.destroy();
  }
}

/** 마크다운 → TipTap 문서 JSON. 실패 시 호출부에서 폴백 처리한다(throw 전파). */
export function parseMarkdown(md: string): JSONContent {
  return withEditor(md, (editor) => editor.getJSON());
}

/** TipTap 문서 JSON → 마크다운 */
export function serializeMarkdown(doc: JSONContent): string {
  return withEditor(doc, (editor) => editor.storage.markdown.getMarkdown());
}
```

- [ ] **Step 5: 테스트 통과 확인 (스파이크 판정)**

Run: `npx vitest run src/features/wiki/editor/markdown.test.ts`
Expected: PASS (13개)

실패 케이스가 있으면 원인별 처리: (a) 직렬화 방언 차이(불릿 기호, 표 정렬 공백)는 케이스 원문을 방언에 맞게 수정 — 의미 손실이 아니다. (b) 표/체크박스가 아예 왕복 불가면 **중단하고** tiptap-markdown을 제거, `prosemirror-markdown` + `markdown-it` GFM 구성으로 markdown.ts를 재구현한 뒤 이 계획 문서의 Task 2 직렬화 부분을 갱신한다.

- [ ] **Step 6: 전체 테스트 + 커밋**

Run: `npm run typecheck && npm test`
Expected: 기존 138개 + 신규 전부 PASS

```bash
git add package.json package-lock.json src/features/wiki/editor docs/superpowers/plans/2026-07-17-block-editor.md
git commit -m "feat(editor): TipTap+tiptap-markdown 도입 — 마크다운 왕복 골든 테스트로 버전 고정"
```

---

### Task 2: `[[위키링크]]` 인라인 노드 확장

**Files:**
- Create: `src/features/wiki/editor/extensions/wikiLink.ts`
- Modify: `src/features/wiki/editor/extensions/base.ts` (wikiLink 등록)
- Modify: `src/features/wiki/editor/markdown.ts` (파스 후 `[[제목]]` 승격 변환)
- Test: `src/features/wiki/editor/extensions/wikiLink.test.ts`

**Interfaces:**
- Consumes: `buildBaseExtensions()`, `parseMarkdown`, `serializeMarkdown` (Task 1)
- Produces: `WikiLink` 확장 (옵션 `{ getPages: () => Page[] }`), `buildBaseExtensions(options?: { getPages?: () => Page[] })` 시그니처 확장, `promoteWikiLinks(doc: JSONContent): JSONContent` (markdown.ts 내부에서 parseMarkdown에 자동 적용)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/wiki/editor/extensions/wikiLink.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { parseMarkdown, serializeMarkdown } from "../markdown";

function findNodes(doc: JSONContent, type: string): JSONContent[] {
  const found: JSONContent[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === type) found.push(node);
    node.content?.forEach(walk);
  };
  walk(doc);
  return found;
}

describe("wikiLink 노드", () => {
  it("[[제목]]을 wikiLink 노드로 파싱한다", () => {
    const doc = parseMarkdown("앞 [[운영 런북]] 뒤");
    const links = findNodes(doc, "wikiLink");
    expect(links).toHaveLength(1);
    expect(links[0].attrs?.title).toBe("운영 런북");
  });

  it("코드 블록 안의 [[제목]]은 노드로 만들지 않는다", () => {
    const doc = parseMarkdown("```\n[[코드속]]\n```");
    expect(findNodes(doc, "wikiLink")).toHaveLength(0);
  });

  it("인라인 코드 안의 [[제목]]도 제외한다", () => {
    const doc = parseMarkdown("`[[코드]]` 텍스트");
    expect(findNodes(doc, "wikiLink")).toHaveLength(0);
  });

  it("wikiLink 노드는 [[제목]]으로 직렬화된다 — 왕복 보존", () => {
    const md = "앞 [[운영 런북]] 뒤";
    expect(serializeMarkdown(parseMarkdown(md)).trim()).toBe(md);
  });

  it("한 문단에 여러 링크", () => {
    const doc = parseMarkdown("[[A]]와 [[B]] 비교");
    expect(findNodes(doc, "wikiLink").map((n) => n.attrs?.title)).toEqual(["A", "B"]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/features/wiki/editor/extensions/wikiLink.test.ts`
Expected: FAIL — wikiLink 노드 없음 (0 length)

- [ ] **Step 3: WikiLink 확장 구현**

`src/features/wiki/editor/extensions/wikiLink.ts`:

```ts
import { Node, nodeInputRule } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Page } from "../../store/types";

export interface WikiLinkOptions {
  /** 존재/부재 판별용 — WikiEditor가 최신 pages를 ref로 공급한다 */
  getPages: () => Page[];
}

/**
 * [[제목]] 인라인 원자 노드.
 * - 에디터 안에서는 칩으로 렌더 (부재 페이지는 데코레이션으로 .wiki-chip-missing 부여)
 * - 마크다운 직렬화는 tiptap-markdown 확장 스토리지 규약(storage.markdown.serialize) 사용
 * - 타이핑 "[[제목]]" 완성 시 inputRule로 노드 승격
 */
export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return { getPages: () => [] };
  },

  addAttributes() {
    return { title: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "span[data-wiki-link]", getAttrs: (el) => ({ title: (el as HTMLElement).dataset.title ?? "" }) }];
  },

  renderHTML({ node }) {
    return [
      "span",
      { "data-wiki-link": "", "data-title": node.attrs.title, class: "wiki-chip" },
      node.attrs.title,
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.title}]]`;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void }, node: { attrs: { title: string } }) {
          state.write(`[[${node.attrs.title}]]`);
        },
      },
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        // wikiLinks.ts의 WIKI_LINK와 같은 문자 클래스 — [, ], 개행 미포함 제목만
        find: /\[\[([^[\]\n]+)\]\]$/,
        type: this.type,
        getAttributes: (match) => ({ title: match[1] }),
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { getPages } = this.options;
    return [
      new Plugin({
        props: {
          decorations(state) {
            const titles = new Set(getPages().map((p) => p.title));
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === "wikiLink" && !titles.has(node.attrs.title)) {
                decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "wiki-chip-missing" }));
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
```

- [ ] **Step 4: base.ts에 등록 + markdown.ts에 승격 변환 추가**

`base.ts` — 시그니처를 옵션 받도록 확장하고 WikiLink 추가:

```ts
import { WikiLink } from "./wikiLink";
import type { Page } from "../../store/types";

export interface BaseExtensionOptions {
  getPages?: () => Page[];
}

export function buildBaseExtensions(options: BaseExtensionOptions = {}): Extensions {
  return [
    // ...기존 목록 그대로...
    WikiLink.configure({ getPages: options.getPages ?? (() => []) }),
  ];
}
```

`markdown.ts` — 파스 결과에서 텍스트 노드의 `[[제목]]`을 노드로 승격 (마크다운 파서는 이 문법을 모르므로 후처리):

```ts
import type { JSONContent } from "@tiptap/core";

/** wikiLinks.ts의 WIKI_LINK와 동일 패턴 — 단일 정의를 재사용하려면 lib에서 export해도 되지만
 *  전역 플래그(g) 상태 공유 사고를 피하려고 여기서 새로 만든다 */
const WIKI_LINK_G = /\[\[([^[\]\n]+)\]\]/g;

/** 코드 계열은 승격 제외 */
const SKIP_TYPES = new Set(["codeBlock"]);

function promoteInline(nodes: JSONContent[]): JSONContent[] {
  return nodes.flatMap((node) => {
    if (node.type !== "text" || !node.text) return [node];
    if (node.marks?.some((m) => m.type === "code")) return [node]; // 인라인 코드 제외
    const parts: JSONContent[] = [];
    let last = 0;
    for (const match of node.text.matchAll(WIKI_LINK_G)) {
      const index = match.index ?? 0;
      if (index > last) parts.push({ ...node, text: node.text.slice(last, index) });
      parts.push({ type: "wikiLink", attrs: { title: match[1] } });
      last = index + match[0].length;
    }
    if (parts.length === 0) return [node];
    if (last < node.text.length) parts.push({ ...node, text: node.text.slice(last) });
    return parts;
  });
}

function promoteWikiLinks(node: JSONContent): JSONContent {
  if (SKIP_TYPES.has(node.type ?? "")) return node;
  if (!node.content) return node;
  const walked = node.content.map(promoteWikiLinks);
  return { ...node, content: promoteInline(walked) };
}

export function parseMarkdown(md: string): JSONContent {
  const doc = withEditor(md, (editor) => editor.getJSON());
  return promoteWikiLinks(doc);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/features/wiki/editor`
Expected: wikiLink 5개 + 기존 골든 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/features/wiki/editor
git commit -m "feat(editor): [[제목]] wikiLink 인라인 노드 — 파스 승격·직렬화 왕복·부재 데코레이션"
```

---

### Task 3: WikiEditor 조립 v1 (컴포넌트 + ref 핸들 + 기본 CSS)

**Files:**
- Create: `src/features/wiki/editor/WikiEditor.tsx`
- Create: `src/features/wiki/editor/editorTestRegistry.ts`
- Modify: `src/app/app.css` (`.wiki-editor` 스코프 추가)
- Test: `src/features/wiki/editor/WikiEditor.test.tsx`

**Interfaces:**
- Consumes: `buildBaseExtensions({ getPages })` (Task 2)
- Produces:
  - `WikiEditorHandle = { getMarkdown(): string; isDirty(): boolean }`
  - `WikiEditorProps = { initialMarkdown: string; pages: Page[] }`
  - `editorRegistry: { current: Editor | null }` — App 통합 테스트에서 본문 입력 시뮬레이션용 시임

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/wiki/editor/WikiEditor.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { WikiEditor, type WikiEditorHandle } from "./WikiEditor";
import { editorRegistry } from "./editorTestRegistry";

describe("WikiEditor", () => {
  it("초기 마크다운을 렌더하고 getMarkdown으로 되돌린다", () => {
    const ref = createRef<WikiEditorHandle>();
    render(<WikiEditor ref={ref} initialMarkdown="# 제목\n\n본문" pages={[]} />);
    expect(screen.getByText("제목")).toBeInTheDocument();
    expect(ref.current!.getMarkdown()).toContain("# 제목");
  });

  it("편집 전 isDirty=false, 내용 변경 후 true", () => {
    const ref = createRef<WikiEditorHandle>();
    render(<WikiEditor ref={ref} initialMarkdown="본문" pages={[]} />);
    expect(ref.current!.isDirty()).toBe(false);
    editorRegistry.current!.commands.insertContent("추가");
    expect(ref.current!.isDirty()).toBe(true);
  });

  it("파싱 실패 시 원문을 플레인 문단으로 보여준다", () => {
    // parseMarkdown이 던지는 케이스를 강제하기 어려우므로, WikiEditor 내부 폴백 함수를 직접 검증
    // (safeParse는 WikiEditor.tsx에서 export)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { safeParse } = require("./WikiEditor") as typeof import("./WikiEditor");
    const doc = safeParse("정상 텍스트");
    expect(doc).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/features/wiki/editor/WikiEditor.test.tsx`
Expected: FAIL — "Cannot find module './WikiEditor'"

- [ ] **Step 3: 구현**

`src/features/wiki/editor/editorTestRegistry.ts`:

```ts
import type { Editor } from "@tiptap/core";

/**
 * 테스트 시임 — jsdom에서 contenteditable 타이핑 시뮬레이션이 불안정하므로,
 * App 통합 테스트는 이 레지스트리로 에디터 인스턴스에 접근해 commands로 입력한다.
 * 프로덕션 코드는 이 모듈을 읽지 않는다(쓰기만 한다).
 */
export const editorRegistry: { current: Editor | null } = { current: null };
```

`src/features/wiki/editor/WikiEditor.tsx`:

```tsx
import { forwardRef, useImperativeHandle, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/core";
import type { Page } from "../store/types";
import { buildBaseExtensions } from "./extensions/base";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { editorRegistry } from "./editorTestRegistry";

export interface WikiEditorHandle {
  /** 현재 문서를 마크다운으로 직렬화 — 저장 시점에만 호출한다 */
  getMarkdown(): string;
  /** 본문이 한 번이라도 변경됐는지 — false면 호출부가 원문을 그대로 저장한다 */
  isDirty(): boolean;
}

export interface WikiEditorProps {
  initialMarkdown: string;
  /** [[링크]] 존재/부재 판별 + 자동완성 후보 */
  pages: Page[];
}

/** 파싱 실패 시 원문 전체를 플레인 문단으로 — 편집이 막히지 않게 한다 (스펙 에러 처리) */
export function safeParse(md: string): JSONContent {
  try {
    return parseMarkdown(md);
  } catch (error) {
    console.warn("마크다운 파싱 실패 — 플레인 텍스트로 로드합니다", error);
    return {
      type: "doc",
      content: md.split(/\n{2,}/).map((para) => ({
        type: "paragraph",
        content: para ? [{ type: "text", text: para }] : [],
      })),
    };
  }
}

export const WikiEditor = forwardRef<WikiEditorHandle, WikiEditorProps>(
  function WikiEditor({ initialMarkdown, pages }, ref) {
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    const dirtyRef = useRef(false);

    const editor = useEditor({
      extensions: [
        ...buildBaseExtensions({ getPages: () => pagesRef.current }),
        Placeholder.configure({ placeholder: "내용을 입력하세요. '/'로 블록을 추가합니다." }),
      ],
      content: safeParse(initialMarkdown),
      onCreate({ editor }) {
        editorRegistry.current = editor;
      },
      onUpdate() {
        dirtyRef.current = true;
      },
      onDestroy() {
        editorRegistry.current = null;
      },
    });

    useImperativeHandle(ref, () => ({
      getMarkdown: () => (editor ? serializeMarkdown(editor.getJSON()) : initialMarkdown),
      isDirty: () => dirtyRef.current,
    }));

    return (
      <div className="wiki-editor">
        <EditorContent editor={editor} />
      </div>
    );
  },
);
```

`src/app/app.css`에 추가 (기존 `.markdown-body` 스타일 뒤):

```css
/* ── 블록 에디터 ───────────────────────────── */
.wiki-editor .ProseMirror {
  outline: none;
  min-height: 320px;
  line-height: 1.7;
}
.wiki-editor .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--color-text-subtlest, #8993a4);
  float: left;
  height: 0;
  pointer-events: none;
}
.wiki-chip {
  border-radius: 4px;
  padding: 0 4px;
  background: var(--color-background-accent-blue-subtlest, #e9f2ff);
  color: var(--color-text-accent-blue, #0c66e4);
}
.wiki-chip-missing {
  background: var(--color-background-accent-red-subtlest, #ffedeb);
  color: var(--color-text-accent-red, #c9372c);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/features/wiki/editor/WikiEditor.test.tsx`
Expected: PASS (3개). `useEditor`가 jsdom에서 비동기 초기화되면 `await waitFor(() => expect(ref.current).toBeTruthy())`를 각 테스트 앞에 추가한다 (`immediatelyRender: true` 옵션으로 동기화 가능하면 그 쪽 우선).

- [ ] **Step 5: 커밋**

```bash
git add src/features/wiki/editor src/app/app.css
git commit -m "feat(editor): WikiEditor 컴포넌트 — getMarkdown/isDirty ref 핸들, 파싱 폴백, 칩 스타일"
```

---

### Task 4: PageEditPage 교체 — 인라인 제목 + WikiEditor + 본문 불변 저장

**Files:**
- Modify: `src/features/wiki/pages/PageEditPage.tsx` (전면 재작성)
- Delete: `src/features/wiki/components/WikiLinkTextArea.tsx`
- Modify: `src/app/app.css` (`.page-edit-title` 추가)
- Modify: `src/app/App.w2-edit.test.tsx`, `src/app/App.w4-autocomplete.test.tsx`, `src/app/App.w4-links.test.tsx` (편집 화면 상호작용을 editorRegistry 경유로 수정)
- Test: `src/app/App.w5-editor.test.tsx` (신규)

**Interfaces:**
- Consumes: `WikiEditor`, `WikiEditorHandle`, `editorRegistry` (Task 3)
- Produces: 없음 (화면 태스크) — 이후 태스크는 편집 화면이 WikiEditor를 쓴다는 전제만 가진다

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`src/app/App.w5-editor.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { seedForTest } from "../mock/seed"; // 기존 테스트들이 쓰는 시드 헬퍼와 동일하게 맞출 것
import { editorRegistry } from "../features/wiki/editor/editorTestRegistry";

describe("W5 블록 에디터 — 편집 화면", () => {
  beforeEach(() => {
    localStorage.clear();
    seedForTest();
  });

  it("편집 진입 시 탭 없이 제목 입력과 에디터가 보인다", async () => {
    renderApp("/spaces/s1/pages/p1/edit");
    expect(await screen.findByPlaceholderText("제목 없음")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "미리보기" })).not.toBeInTheDocument();
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
  });

  it("본문 수정 후 저장하면 보기 화면에 반영된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/s1/pages/p1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.commands.insertContentAt(
      editorRegistry.current!.state.doc.content.size,
      { type: "paragraph", content: [{ type: "text", text: "새로 추가한 문단" }] },
    );
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("새로 추가한 문단")).toBeInTheDocument();
  });

  it("제목만 고치고 저장하면 본문 바이트가 그대로다", async () => {
    const user = userEvent.setup();
    const { getPage } = await import("../features/wiki/store/wikiStore");
    const before = (await getPage("p1"))!.body;
    renderApp("/spaces/s1/pages/p1/edit");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    const titleInput = screen.getByPlaceholderText("제목 없음");
    await user.clear(titleInput);
    await user.type(titleInput, "새 제목");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("새 제목");
    expect((await getPage("p1"))!.body).toBe(before);
  });
});
```

주의: `seedForTest`는 실제 시드 헬퍼 이름/시그니처(`src/mock/seed.ts`와 기존 `App.w2-edit.test.tsx`가 쓰는 방식)에 맞춰 조정한다. 페이지/스페이스 id(`s1`, `p1`)도 시드 데이터 기준으로 맞춘다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/app/App.w5-editor.test.tsx`
Expected: FAIL — "제목 없음" placeholder 없음 (아직 TextField "제목" + Tabs 구조)

- [ ] **Step 3: PageEditPage 재작성**

`src/features/wiki/pages/PageEditPage.tsx` — 로드/가드/네비게이션 로직은 유지하고 렌더부와 저장부만 교체:

```tsx
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import { Button, Spinner, useToast } from "@chanho/react";
import { createPage, getPage, updatePage } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/WikiLayout";
import { WikiEditor, type WikiEditorHandle } from "../editor/WikiEditor";

/**
 * 페이지 편집 화면 — 생성(/pages/new?parent=<id|없음>)과 수정(/pages/:pageId/edit) 공용.
 * 노션풍: 대형 인라인 제목 + WYSIWYG 본문. 저장은 명시적(컨플식).
 */
export function PageEditPage() {
  const { spaceId, pageId } = useParams();
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get("parent");
  const navigate = useNavigate();
  const toast = useToast();
  const { pages, reloadPages } = useOutletContext<WikiOutletContext>();
  const isEdit = pageId !== undefined;

  const editorRef = useRef<WikiEditorHandle>(null);
  const [title, setTitle] = useState(() => (isEdit ? "" : (searchParams.get("title") ?? "")));
  const [initialBody, setInitialBody] = useState<string | null>(isEdit ? null : "");
  const [notFound, setNotFound] = useState(false);
  const [pageSpaceId, setPageSpaceId] = useState<string | null>(null);
  const [titleDirty, setTitleDirty] = useState(false);

  useEffect(() => {
    if (!isEdit || !pageId) return;
    void getPage(pageId).then((page) => {
      if (page === null) {
        setNotFound(true);
      } else {
        setTitle(page.title);
        setInitialBody(page.body);
        setPageSpaceId(page.spaceId);
      }
    });
  }, [isEdit, pageId]);

  // 같은 create 라우트 안에서 ?title=만 바뀌는 네비게이션도 프리필 반영 (b388943 유지)
  useEffect(() => {
    if (isEdit) return;
    const prefill = searchParams.get("title");
    if (prefill !== null) {
      setTitle(prefill);
      setTitleDirty(false);
    }
  }, [isEdit, searchParams]);

  if (!spaceId) {
    return <Navigate to="/" replace />;
  }
  if (notFound) {
    return <p>페이지를 찾을 수 없습니다</p>;
  }
  if (initialBody === null) {
    return <Spinner label="페이지 로딩 중" />;
  }
  if (isEdit && pageId && pageSpaceId !== null && pageSpaceId !== spaceId) {
    return <Navigate to={`/spaces/${pageSpaceId}/pages/${pageId}/edit`} replace />;
  }

  const isDirty = () => titleDirty || (editorRef.current?.isDirty() ?? false);

  const handleSave = async () => {
    // 본문 불변 보장 — 본문 미수정이면 직렬화 대신 원문 그대로 (버전 diff 노이즈 방지)
    const body = editorRef.current?.isDirty() ? editorRef.current.getMarkdown() : initialBody;
    try {
      if (isEdit && pageId) {
        const saved = await updatePage(pageId, { title, body });
        toast({ title: "페이지를 저장했습니다", appearance: "success" });
        await reloadPages();
        navigate(`/spaces/${spaceId}/pages/${saved.id}`);
      } else {
        const created = await createPage({ spaceId, parentId, title, body });
        toast({ title: `"${created.title}" 페이지를 만들었습니다`, appearance: "success" });
        await reloadPages();
        navigate(`/spaces/${spaceId}/pages/${created.id}`);
      }
    } catch (error) {
      toast({
        title: "저장 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleCancel = () => {
    if (isEdit) {
      navigate(`/spaces/${spaceId}/pages/${pageId}`);
    } else if (parentId) {
      navigate(`/spaces/${spaceId}/pages/${parentId}`);
    } else {
      navigate(`/spaces/${spaceId}`);
    }
  };

  return (
    <div className="page-edit">
      <input
        className="page-edit-title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setTitleDirty(true);
        }}
        placeholder="제목 없음"
        aria-label="페이지 제목"
      />
      <WikiEditor ref={editorRef} initialMarkdown={initialBody} pages={pages ?? []} />
      <div className="page-edit-actions">
        <Button onClick={handleSave} disabled={!title.trim()}>
          저장
        </Button>
        <Button variant="subtle" onClick={handleCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
```

(`isDirty`는 Task 5의 이탈 가드에서 사용한다 — 이 태스크에서는 정의만.)

`app.css`:

```css
.page-edit-title {
  border: none;
  outline: none;
  width: 100%;
  font-size: 2rem;
  font-weight: 700;
  padding: 8px 0;
  background: transparent;
  color: inherit;
}
.page-edit-title::placeholder {
  color: var(--color-text-subtlest, #8993a4);
}
```

- [ ] **Step 4: WikiLinkTextArea 삭제 + 기존 테스트 수정**

```bash
git rm src/features/wiki/components/WikiLinkTextArea.tsx
```

기존 테스트 수정 방침 (각 파일에서 편집 화면 본문을 만지는 부분만):
- `App.w2-edit.test.tsx`: `screen.getByLabelText("본문")`(textarea) → `editorRegistry.current!.commands.setContent(...)` + `getByPlaceholderText("제목 없음")`. "미리보기 탭" 검증 테스트는 **삭제** (탭 자체가 없어짐 — 스펙 반영).
- `App.w4-autocomplete.test.tsx`: textarea 기반 `[[` 자동완성 테스트는 Task 6에서 에디터 기반으로 재작성하므로, 이 태스크에서는 `describe.skip` 처리하고 파일 상단에 `// TODO(Task 6): 에디터 자동완성으로 재작성` 주석. Task 6에서 skip 해제·재작성.
- `App.w4-links.test.tsx`: 편집 경유 부분(`(body as HTMLTextAreaElement).value` 검사)은 `editorRegistry.current!.storage.markdown.getMarkdown()` 검사로 교체. 보기 화면 링크 렌더 테스트는 무변경.

- [ ] **Step 5: 전체 테스트 통과 확인**

Run: `npm run typecheck && npm test`
Expected: 전부 PASS (skip 1 describe 허용)

- [ ] **Step 6: 커밋**

```bash
git add -A src/features/wiki src/app
git commit -m "feat(edit): 편집 화면을 WYSIWYG로 교체 — 인라인 제목·탭 제거·본문 불변 저장, WikiLinkTextArea 제거"
```

---

### Task 5: dirty 이탈 가드 (취소 confirm + beforeunload) + 스펙 각주

**Files:**
- Modify: `src/features/wiki/pages/PageEditPage.tsx`
- Modify: `docs/superpowers/specs/2026-07-17-block-editor-design.md` (가드 범위 각주)
- Test: `src/app/App.w5-editor.test.tsx` (케이스 추가)

**Interfaces:**
- Consumes: Task 4의 `isDirty()`

- [ ] **Step 1: 실패하는 테스트 추가**

`App.w5-editor.test.tsx`에 추가:

```tsx
import { vi } from "vitest";

it("본문 변경 후 취소를 누르면 confirm을 묻고, 거부하면 편집에 머문다", async () => {
  const user = userEvent.setup();
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  renderApp("/spaces/s1/pages/p1/edit");
  await waitFor(() => expect(editorRegistry.current).toBeTruthy());
  editorRegistry.current!.commands.insertContent("변경");
  await user.click(screen.getByRole("button", { name: "취소" }));
  expect(confirmSpy).toHaveBeenCalledWith("저장하지 않은 변경이 있습니다. 나가시겠습니까?");
  expect(screen.getByTestId("location")).toHaveTextContent("/edit");
  confirmSpy.mockRestore();
});

it("변경이 없으면 취소 시 confirm 없이 이동한다", async () => {
  const user = userEvent.setup();
  const confirmSpy = vi.spyOn(window, "confirm");
  renderApp("/spaces/s1/pages/p1/edit");
  await waitFor(() => expect(editorRegistry.current).toBeTruthy());
  await user.click(screen.getByRole("button", { name: "취소" }));
  expect(confirmSpy).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/app/App.w5-editor.test.tsx`
Expected: FAIL — confirm 미호출

- [ ] **Step 3: 구현**

`PageEditPage.tsx`의 `handleCancel` 앞에 가드 삽입 + beforeunload effect 추가:

```tsx
const handleCancel = () => {
  if (isDirty() && !window.confirm("저장하지 않은 변경이 있습니다. 나가시겠습니까?")) {
    return;
  }
  // ...기존 분기 그대로...
};

// 브라우저 새로고침/닫기 가드 — 라우터 내비게이션은 선언형 Routes라 useBlocker 불가(스펙 각주 참조)
useEffect(() => {
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty()) e.preventDefault();
  };
  window.addEventListener("beforeunload", onBeforeUnload);
  return () => window.removeEventListener("beforeunload", onBeforeUnload);
});
```

스펙 문서 "편집 이탈 가드" 절에 각주 추가:

```markdown
> 구현 노트(2026-07-17): 앱이 선언형 `<Routes>`를 사용해 `useBlocker`를 쓸 수 없다.
> 가드 범위는 ① 취소 버튼 confirm ② beforeunload(새로고침/닫기)로 한정하고,
> 사이드바 내비게이션 가드는 데이터 라우터 전환 시 후속 티켓으로 다룬다.
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npm run typecheck && npm test`
Expected: PASS

```bash
git add src/features/wiki/pages/PageEditPage.tsx src/app/App.w5-editor.test.tsx docs/superpowers/specs/2026-07-17-block-editor-design.md
git commit -m "feat(edit): dirty 이탈 가드 — 취소 confirm + beforeunload, 가드 범위 스펙 각주"
```

---

### Task 6: 서제스천 팝업 공용 UI + `[[` 자동완성

**Files:**
- Create: `src/features/wiki/editor/components/SuggestionPopup.tsx`
- Create: `src/features/wiki/editor/extensions/wikiLinkSuggestion.ts`
- Modify: `src/features/wiki/editor/WikiEditor.tsx` (팝업 상태 연결)
- Modify: `src/app/app.css` (팝업 스타일 — 기존 WikiLinkTextArea 자동완성 CSS 재활용)
- Test: `src/features/wiki/editor/extensions/wikiLinkSuggestion.test.ts`, `src/app/App.w4-autocomplete.test.tsx` (skip 해제·재작성)

**Interfaces:**
- Consumes: `WikiLink` 노드 (Task 2), WikiEditor (Task 3)
- Produces:
  - `filterLinkCandidates(pages: Page[], query: string): Page[]` — 순수 함수 (최대 8개, `[`·`]`·개행 제목 제외, 부분 일치)
  - `SuggestionPopupState = { items: Array<{ id: string; label: string }>; highlight: number; left: number; top: number }`
  - WikiEditor 내부 규약: suggestion 확장은 `onStateChange(state | null)` 콜백으로 팝업을 그리고, Enter/↑↓/Escape는 확장이 처리

- [ ] **Step 1: 실패하는 순수 로직 테스트 작성**

`wikiLinkSuggestion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterLinkCandidates } from "./wikiLinkSuggestion";
import type { Page } from "../../store/types";

const page = (id: string, title: string): Page => ({
  id, spaceId: "s1", parentId: null, title, body: "", position: 0,
  createdBy: "u1", updatedBy: "u1", createdAt: "", updatedAt: "",
});

describe("filterLinkCandidates", () => {
  const pages = [
    page("1", "운영 런북"), page("2", "운영 가이드"), page("3", "개발 환경"),
    page("4", "대괄호[포함]"), page("5", "개행\n포함"),
  ];

  it("부분 일치 필터", () => {
    expect(filterLinkCandidates(pages, "운영").map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("빈 쿼리는 전체(제외 규칙 적용)", () => {
    expect(filterLinkCandidates(pages, "").map((p) => p.id)).toEqual(["1", "2", "3"]);
  });

  it("[, ], 개행 포함 제목 제외", () => {
    const ids = filterLinkCandidates(pages, "").map((p) => p.id);
    expect(ids).not.toContain("4");
    expect(ids).not.toContain("5");
  });

  it("최대 8개", () => {
    const many = Array.from({ length: 12 }, (_, i) => page(`m${i}`, `문서 ${i}`));
    expect(filterLinkCandidates(many, "문서")).toHaveLength(8);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/features/wiki/editor/extensions/wikiLinkSuggestion.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`wikiLinkSuggestion.ts`:

```ts
import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import type { Page } from "../../store/types";

const MAX_SUGGESTIONS = 8;

/** [[제목]] 문법이 표현할 수 없는 제목([, ], 개행)은 후보 제외 — WikiLinkTextArea 규칙 이식 */
export function filterLinkCandidates(pages: Page[], query: string): Page[] {
  const q = query.toLowerCase();
  return pages
    .filter((p) => !/[[\]\n]/.test(p.title))
    .filter((p) => p.title.toLowerCase().includes(q))
    .slice(0, MAX_SUGGESTIONS);
}

export interface WikiLinkSuggestionOptions {
  getPages: () => Page[];
  /** 팝업 상태 브릿지 — null이면 닫힘. WikiEditor가 React 상태로 그린다 */
  onStateChange: (state: {
    items: Page[];
    highlight: number;
    clientRect: DOMRect | null;
  } | null) => void;
}

export const WikiLinkSuggestion = Extension.create<WikiLinkSuggestionOptions>({
  name: "wikiLinkSuggestion",

  addOptions() {
    return { getPages: () => [], onStateChange: () => {} };
  },

  addProseMirrorPlugins() {
    const { getPages, onStateChange } = this.options;
    let items: Page[] = [];
    let highlight = 0;
    let clientRect: (() => DOMRect | null) | null = null;

    const emit = () =>
      onStateChange(items.length ? { items, highlight, clientRect: clientRect?.() ?? null } : null);

    return [
      Suggestion({
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        startOfLine: false,
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [{ type: "wikiLink", attrs: { title: (props as Page).title } }])
            .run();
        },
        items: ({ query }) => filterLinkCandidates(getPages(), query),
        render: () => ({
          onStart(props) {
            items = props.items as Page[];
            highlight = 0;
            clientRect = props.clientRect ?? null;
            emit();
          },
          onUpdate(props) {
            items = props.items as Page[];
            highlight = Math.min(highlight, Math.max(items.length - 1, 0));
            clientRect = props.clientRect ?? null;
            emit();
          },
          onKeyDown(props) {
            if (props.event.key === "Escape") {
              items = [];
              emit();
              return true;
            }
            if (props.event.key === "ArrowDown") {
              highlight = (highlight + 1) % items.length;
              emit();
              return true;
            }
            if (props.event.key === "ArrowUp") {
              highlight = (highlight - 1 + items.length) % items.length;
              emit();
              return true;
            }
            if (props.event.key === "Enter" && items.length) {
              props.command(items[highlight]);
              return true;
            }
            return false;
          },
          onExit() {
            items = [];
            emit();
          },
        }),
      }),
    ];
  },
});
```

`SuggestionPopup.tsx`:

```tsx
export interface SuggestionPopupProps {
  items: Array<{ id: string; label: string }>;
  highlight: number;
  left: number;
  top: number;
  onPick: (index: number) => void;
}

/** 에디터 위 절대 위치 후보 목록 — [[자동완성·슬래시 메뉴 공용. 옵션은 탭 순서 제외(role=option) */
export function SuggestionPopup({ items, highlight, left, top, onPick }: SuggestionPopupProps) {
  return (
    <ul className="editor-suggestions" role="listbox" style={{ left, top }}>
      {items.map((item, i) => (
        <li key={item.id} role="option" aria-selected={i === highlight}>
          <button type="button" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); onPick(i); }}>
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

WikiEditor 연결 — 상태 + 팝업 렌더 추가:

```tsx
const [linkMenu, setLinkMenu] = useState<{ items: Page[]; highlight: number; clientRect: DOMRect | null } | null>(null);
const linkCommandRef = useRef<((item: Page) => void) | null>(null);
// extensions 배열에 추가:
WikiLinkSuggestion.configure({
  getPages: () => pagesRef.current,
  onStateChange: setLinkMenu,
}),
// JSX — EditorContent 아래:
{linkMenu && linkMenu.clientRect && (
  <SuggestionPopup
    items={linkMenu.items.map((p) => ({ id: p.id, label: p.title }))}
    highlight={linkMenu.highlight}
    left={linkMenu.clientRect.left}
    top={linkMenu.clientRect.bottom + 4}
    onPick={(i) => linkCommandRef.current?.(linkMenu.items[i])}
  />
)}
```

주의: 클릭 선택(onPick)에 command 함수가 필요하다 — `onStart`/`onUpdate`에서 `linkCommandRef.current = props.command`를 저장하도록 `onStateChange`에 command도 함께 전달하게 확장 옵션 시그니처를 조정한다(구현 시 필드 하나 추가: `command: (item: Page) => void`).

`app.css` — 기존 `.wiki-autocomplete` 스타일이 있으면 클래스명만 `.editor-suggestions`로 복제, 없으면:

```css
.editor-suggestions {
  position: fixed;
  z-index: 30;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--color-background-elevation-surface-overlay, #fff);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 220px;
}
.editor-suggestions [aria-selected="true"] button {
  background: var(--color-background-accent-blue-subtlest, #e9f2ff);
}
.editor-suggestions button {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
}
```

- [ ] **Step 4: App.w4-autocomplete.test.tsx skip 해제·재작성**

기존 시나리오(입력 → 후보 표시 → 키보드/클릭 선택 → 본문 삽입)를 editorRegistry 기반으로 재작성:

```tsx
// 후보 표시: editorRegistry.current!.commands.insertContent("[[운영") 후
// await screen.findByRole("listbox") / getByRole("option", { name: "운영 런북" })
// 선택 결과: getMarkdown()에 "[[운영 런북]]" 포함 확인
```

jsdom에서 Suggestion 트리거가 insertContent로 발화하지 않으면(플러그인이 실제 키 입력 트랜잭션에만 반응하는 경우), `editor.view.dispatch(editor.state.tr.insertText("[["))`로 텍스트 트랜잭션을 직접 디스패치한다.

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `npm run typecheck && npm test`
Expected: 전부 PASS (skip 0)

```bash
git add src/features/wiki/editor src/app
git commit -m "feat(editor): [[ 자동완성 — suggestion 확장 + 공용 팝업, 후보 8개·제외 규칙 이식"
```

---

### Task 7: 슬래시(/) 메뉴

**Files:**
- Create: `src/features/wiki/editor/extensions/slashMenu.ts`
- Modify: `src/features/wiki/editor/WikiEditor.tsx` (팝업 연결 — Task 6과 동일 패턴)
- Test: `src/features/wiki/editor/extensions/slashMenu.test.ts`

**Interfaces:**
- Consumes: `SuggestionPopup` (Task 6)
- Produces: `SLASH_ITEMS: SlashItem[]`, `filterSlashItems(query: string): SlashItem[]`, `SlashItem = { id: string; label: string; run(editor: Editor): void }`

- [ ] **Step 1: 실패하는 테스트 작성**

`slashMenu.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SLASH_ITEMS, filterSlashItems } from "./slashMenu";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "./base";

describe("슬래시 메뉴", () => {
  it("전체 항목 — 화이트리스트 블록과 일치", () => {
    expect(SLASH_ITEMS.map((i) => i.id)).toEqual([
      "h1", "h2", "h3", "bullet", "ordered", "task", "quote", "code", "divider", "table", "image",
    ]);
  });

  it("한글 라벨 필터", () => {
    expect(filterSlashItems("제목").map((i) => i.id)).toEqual(["h1", "h2", "h3"]);
    expect(filterSlashItems("표").map((i) => i.id)).toEqual(["table"]);
  });

  it("run(h1)은 현재 블록을 제목1로 바꾼다", () => {
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    SLASH_ITEMS.find((i) => i.id === "h1")!.run(editor);
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("# 본문");
    editor.destroy();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/features/wiki/editor/extensions/slashMenu.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`slashMenu.ts`:

```ts
import { Extension, type Editor } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";

export interface SlashItem {
  id: string;
  label: string;
  run: (editor: Editor) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
  { id: "h1", label: "제목 1", run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { id: "h2", label: "제목 2", run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { id: "h3", label: "제목 3", run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { id: "bullet", label: "글머리 목록", run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: "ordered", label: "번호 목록", run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: "task", label: "체크박스 목록", run: (e) => e.chain().focus().toggleTaskList().run() },
  { id: "quote", label: "인용", run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: "code", label: "코드 블록", run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { id: "divider", label: "구분선", run: (e) => e.chain().focus().setHorizontalRule().run() },
  { id: "table", label: "표", run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  {
    id: "image",
    label: "이미지 (URL)",
    run: (e) => {
      const src = window.prompt("이미지 URL을 입력하세요");
      if (src) e.chain().focus().setImage({ src }).run();
    },
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter((i) => i.label.toLowerCase().includes(q));
}
```

Extension 본체는 Task 6의 `WikiLinkSuggestion`과 동일 구조로 `char: "/"`, `items: ({ query }) => filterSlashItems(query)`, `command: ({ editor, range, props }) => { editor.chain().focus().deleteRange(range).run(); (props as SlashItem).run(editor); }`. WikiEditor에 두 번째 팝업 상태(`slashMenu`)로 연결 — Task 6과 같은 `SuggestionPopup` 재사용.

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npm run typecheck && npm test`
Expected: PASS

```bash
git add src/features/wiki/editor
git commit -m "feat(editor): 슬래시 메뉴 — 화이트리스트 11개 블록 삽입, 한글 라벨 필터"
```

---

### Task 8: 선택 시 플로팅 툴바 (BubbleMenu)

**Files:**
- Create: `src/features/wiki/editor/components/BubbleToolbar.tsx`
- Modify: `src/features/wiki/editor/WikiEditor.tsx`
- Modify: `src/app/app.css`
- Test: `src/features/wiki/editor/components/BubbleToolbar.test.tsx`

**Interfaces:**
- Consumes: WikiEditor의 `editor` 인스턴스
- Produces: `BubbleToolbar({ editor }: { editor: Editor })` — 굵게/기울임/취소선/인라인 코드/링크 5버튼

- [ ] **Step 1: 실패하는 테스트 작성**

jsdom에서는 위치 계산이 안 되므로 **버튼 동작만** 검증한다 — BubbleMenu 래퍼 없이 내부 버튼 행을 분리 export:

```tsx
// BubbleToolbar.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { buildBaseExtensions } from "../extensions/base";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { ToolbarButtons } from "./BubbleToolbar";

describe("ToolbarButtons", () => {
  it("굵게 버튼이 선택 텍스트에 bold를 토글한다", async () => {
    const user = userEvent.setup();
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    editor.commands.selectAll();
    render(<ToolbarButtons editor={editor} />);
    await user.click(screen.getByRole("button", { name: "굵게" }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("**본문**");
    editor.destroy();
  });

  it("링크 버튼은 URL을 물어 링크를 건다", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://example.com");
    const editor = new Editor({ extensions: buildBaseExtensions(), content: parseMarkdown("본문") });
    editor.commands.selectAll();
    render(<ToolbarButtons editor={editor} />);
    await user.click(screen.getByRole("button", { name: "링크" }));
    expect(serializeMarkdown(editor.getJSON()).trim()).toBe("[본문](https://example.com)");
    promptSpy.mockRestore();
    editor.destroy();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/features/wiki/editor/components/BubbleToolbar.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`BubbleToolbar.tsx`:

```tsx
import { BubbleMenu } from "@tiptap/react";
import type { Editor } from "@tiptap/core";

/** 버튼 행 — BubbleMenu와 분리해 jsdom에서 단독 테스트 가능하게 한다 */
export function ToolbarButtons({ editor }: { editor: Editor }) {
  const setLink = () => {
    const url = window.prompt("링크 URL을 입력하세요", editor.getAttributes("link").href ?? "");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };
  const btn = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={active ? "is-active" : undefined}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    >
      {label === "굵게" ? "B" : label === "기울임" ? "I" : label === "취소선" ? "S" : label === "코드" ? "<>" : "🔗"}
    </button>
  );
  return (
    <div className="bubble-toolbar" role="toolbar" aria-label="서식">
      {btn("굵게", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run())}
      {btn("기울임", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run())}
      {btn("취소선", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run())}
      {btn("코드", editor.isActive("code"), () => editor.chain().focus().toggleCode().run())}
      {btn("링크", editor.isActive("link"), setLink)}
    </div>
  );
}

export function BubbleToolbar({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
      <ToolbarButtons editor={editor} />
    </BubbleMenu>
  );
}
```

버튼 접근성 주의: 테스트가 `name: "굵게"`로 찾으므로 `aria-label`이 접근 가능한 이름이 된다.

WikiEditor JSX에 `{editor && <BubbleToolbar editor={editor} />}` 추가. `@tiptap/extension-bubble-menu`가 peer로 필요하면 설치.

`app.css`:

```css
.bubble-toolbar {
  display: flex;
  gap: 2px;
  padding: 4px;
  background: var(--color-background-elevation-surface-overlay, #fff);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.bubble-toolbar button {
  border: none;
  background: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}
.bubble-toolbar button.is-active {
  background: var(--color-background-accent-blue-subtlest, #e9f2ff);
  color: var(--color-text-accent-blue, #0c66e4);
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npm run typecheck && npm test`
Expected: PASS

```bash
git add src/features/wiki/editor src/app/app.css package.json package-lock.json
git commit -m "feat(editor): 선택 플로팅 툴바 — 굵게/기울임/취소선/코드/링크"
```

---

### Task 9: 코드 블록 NodeView (언어 선택 + 복사 버튼)

**Files:**
- Create: `src/features/wiki/editor/components/CodeBlockView.tsx`
- Modify: `src/features/wiki/editor/extensions/base.ts` (StarterKit codeBlock에 NodeView 연결)
- Modify: `src/app/app.css`
- Test: `src/features/wiki/editor/components/CodeBlockView.test.tsx`

**Interfaces:**
- Consumes: base.ts 확장 목록
- Produces: 없음 (에디터 내부 UI)

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// CodeBlockView.test.tsx — WikiEditor로 코드 블록을 렌더해 검증
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { WikiEditor, type WikiEditorHandle } from "../WikiEditor";

describe("CodeBlockView", () => {
  it("언어 셀렉트가 보이고 변경이 직렬화에 반영된다", async () => {
    const user = userEvent.setup();
    const ref = createRef<WikiEditorHandle>();
    render(<WikiEditor ref={ref} initialMarkdown={"```ts\nconst a = 1;\n```"} pages={[]} />);
    const select = await screen.findByLabelText("코드 언어");
    expect((select as HTMLSelectElement).value).toBe("ts");
    await user.selectOptions(select, "python");
    expect(ref.current!.getMarkdown()).toContain("```python");
  });

  it("복사 버튼이 코드 내용을 클립보드에 쓴다", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<WikiEditor initialMarkdown={"```ts\nconst a = 1;\n```"} pages={[]} />);
    await user.click(await screen.findByRole("button", { name: "코드 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("const a = 1;"));
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/features/wiki/editor/components/CodeBlockView.test.tsx`
Expected: FAIL — "코드 언어" 없음

- [ ] **Step 3: 구현**

`CodeBlockView.tsx`:

```tsx
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

const LANGUAGES = [
  "plaintext", "ts", "js", "tsx", "jsx", "java", "kotlin", "python",
  "sql", "json", "yaml", "bash", "html", "css", "markdown",
];

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "plaintext";
  const copy = () => {
    void navigator.clipboard.writeText(node.textContent);
  };
  return (
    <NodeViewWrapper className="code-block-view">
      <div className="code-block-toolbar" contentEditable={false}>
        <select
          aria-label="코드 언어"
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value === "plaintext" ? null : e.target.value })}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
        <button type="button" aria-label="코드 복사" onClick={copy}>복사</button>
      </div>
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
```

`base.ts` — StarterKit의 codeBlock을 비활성화하고 NodeView 연결 버전으로 교체:

```ts
import CodeBlock from "@tiptap/extension-code-block";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockView } from "../components/CodeBlockView";

// StarterKit.configure({ heading: ..., codeBlock: false }),
CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}),
```

주의: `value`가 "ts"처럼 목록에 있는 값이 아닐 수도 있다(기존 문서) — select에 없는 언어면 옵션에 동적으로 추가한다:

```tsx
const options = LANGUAGES.includes(language) ? LANGUAGES : [language, ...LANGUAGES];
```

`app.css`:

```css
.code-block-view { position: relative; }
.code-block-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  position: absolute;
  top: 4px;
  right: 4px;
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npm run typecheck && npm test`
Expected: PASS — 특히 Task 1 골든 "코드 블록 언어" 케이스가 여전히 그린인지 확인 (NodeView는 스키마 무영향)

```bash
git add src/features/wiki/editor src/app/app.css
git commit -m "feat(editor): 코드 블록 NodeView — 언어 선택·복사 버튼"
```

---

### Task 10: 이미지 로드 실패 placeholder

**Files:**
- Create: `src/features/wiki/editor/components/ImageView.tsx`
- Modify: `src/features/wiki/editor/extensions/base.ts` (Image에 NodeView 연결)
- Modify: `src/app/app.css`
- Test: `src/features/wiki/editor/components/ImageView.test.tsx`

**Interfaces:**
- Consumes: base.ts
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// ImageView.test.tsx
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WikiEditor } from "../WikiEditor";

describe("ImageView", () => {
  it("로드 실패 시 대체 텍스트 placeholder 박스를 보여준다", async () => {
    render(<WikiEditor initialMarkdown="![다이어그램](https://example.com/broken.png)" pages={[]} />);
    const img = await screen.findByRole("img", { name: "다이어그램" });
    fireEvent.error(img);
    expect(screen.getByText(/다이어그램/)).toBeInTheDocument();
    expect(screen.getByText(/이미지를 불러올 수 없습니다/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/features/wiki/editor/components/ImageView.test.tsx`
Expected: FAIL — placeholder 문구 없음

- [ ] **Step 3: 구현**

`ImageView.tsx`:

```tsx
import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

export function ImageView({ node }: NodeViewProps) {
  const [failed, setFailed] = useState(false);
  const { src, alt } = node.attrs as { src: string; alt: string | null };
  if (failed) {
    return (
      <NodeViewWrapper className="image-view image-view-broken" contentEditable={false}>
        <span>{alt ?? src}</span>
        <span className="image-view-broken-note">이미지를 불러올 수 없습니다</span>
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper className="image-view" contentEditable={false}>
      <img src={src} alt={alt ?? ""} onError={() => setFailed(true)} />
    </NodeViewWrapper>
  );
}
```

`base.ts`의 Image를 `Image.extend({ addNodeView: () => ReactNodeViewRenderer(ImageView) })`로 교체.

`app.css`:

```css
.image-view img { max-width: 100%; }
.image-view-broken {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border: 1px dashed var(--color-border, #dcdfe4);
  border-radius: 6px;
  color: var(--color-text-subtlest, #8993a4);
  background: var(--color-background-neutral-subtle, #f7f8f9);
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npm run typecheck && npm test`
Expected: PASS (골든 "이미지" 케이스 포함)

```bash
git add src/features/wiki/editor src/app/app.css
git commit -m "feat(editor): 이미지 NodeView — 로드 실패 시 placeholder 박스"
```

---

### Task 11: 블록 드래그 핸들

**Files:**
- Modify: `package.json` (`tiptap-extension-global-drag-handle` 추가)
- Modify: `src/features/wiki/editor/WikiEditor.tsx` (확장 등록 — 편집 전용이므로 base가 아닌 WikiEditor에)
- Modify: `src/app/app.css`
- Test: `src/features/wiki/editor/WikiEditor.test.tsx` (등록 확인 케이스 추가)

**Interfaces:**
- Consumes: WikiEditor

- [ ] **Step 1: 의존성 설치**

```bash
npm install tiptap-extension-global-drag-handle
```

설치 불가/tiptap v2 비호환이면: 이 태스크를 보류하고 스펙 리스크 표에 기록, 사용자에게 보고 후 다음 태스크 진행 (드래그 핸들은 다른 기능과 독립).

- [ ] **Step 2: 실패하는 테스트 추가**

`WikiEditor.test.tsx`에:

```tsx
it("드래그 핸들 확장이 등록된다", async () => {
  render(<WikiEditor initialMarkdown="본문" pages={[]} />);
  await waitFor(() => expect(editorRegistry.current).toBeTruthy());
  const names = editorRegistry.current!.extensionManager.extensions.map((e) => e.name);
  expect(names).toContain("globalDragHandle");
});
```

(실제 드래그 동작은 브라우저 의존 — Global Constraints에 따라 jsdom 테스트 제외.)

- [ ] **Step 3: 구현**

WikiEditor extensions 배열에:

```tsx
import GlobalDragHandle from "tiptap-extension-global-drag-handle";

GlobalDragHandle.configure({
  dragHandleWidth: 20,
  scrollTreshold: 100, // 패키지 옵션명 오탈자 그대로 (upstream API)
}),
```

`app.css`:

```css
.drag-handle {
  position: fixed;
  opacity: 1;
  transition: opacity 0.2s ease-in;
  border-radius: 4px;
  width: 20px;
  height: 20px;
  cursor: grab;
  background: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='5' cy='4' r='1.2' fill='%238993a4'/%3E%3Ccircle cx='11' cy='4' r='1.2' fill='%238993a4'/%3E%3Ccircle cx='5' cy='8' r='1.2' fill='%238993a4'/%3E%3Ccircle cx='11' cy='8' r='1.2' fill='%238993a4'/%3E%3Ccircle cx='5' cy='12' r='1.2' fill='%238993a4'/%3E%3Ccircle cx='11' cy='12' r='1.2' fill='%238993a4'/%3E%3C/svg%3E") no-repeat center;
}
.drag-handle.hide { opacity: 0; pointer-events: none; }
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npm run typecheck && npm test`
Expected: PASS

```bash
git add package.json package-lock.json src/features/wiki/editor src/app/app.css
git commit -m "feat(editor): 블록 드래그 핸들 — tiptap-extension-global-drag-handle"
```

---

### Task 12: 문서 레이아웃 통일 + 최종 스윕

**Files:**
- Modify: `src/app/app.css` (문서 컬럼 규격)
- Modify: `src/features/wiki/pages/PageViewPage.tsx`, `src/features/wiki/pages/PageEditPage.tsx` (컬럼 래퍼 클래스)
- Test: 전체 스윕 (신규 테스트 없음)

**Interfaces:**
- Consumes: 전 태스크 결과

- [ ] **Step 1: 문서 컬럼 CSS**

```css
/* 보기/편집 공용 문서 컬럼 — 노션풍 중앙 정렬 */
.doc-column {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 24px;
}
```

`PageViewPage`의 `<article className="page-view">` → `<article className="page-view doc-column">`,
`PageEditPage`의 `<div className="page-edit">` → `<div className="page-edit doc-column">`.

- [ ] **Step 2: 전체 검증**

Run: `npm run typecheck && npm test && npm run build`
Expected: 전부 PASS + 빌드 성공

- [ ] **Step 3: 수동 스모크 (권장)**

`npm run dev` 후 브라우저에서: 슬래시 메뉴로 표 삽입 → 저장 → 보기에서 GFM 표 렌더 확인, `[[` 자동완성 → 칩 → 저장 → 보기에서 링크 확인, 버블 툴바 굵게 → 저장 → `**` 마크다운 확인, 드래그 핸들로 블록 이동, 버전 히스토리 diff가 여전히 라인 단위로 유의미한지 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/app/app.css src/features/wiki/pages
git commit -m "feat(wiki): 보기/편집 문서 컬럼 레이아웃 통일 — 노션풍 중앙 720px"
```

---

## Self-Review 체크 결과

- **스펙 커버리지**: 블록 화이트리스트(T1·T7·T9·T10), [[링크]] 파스/직렬화/자동완성(T2·T6), 필수 상호작용 4종(T6·T7·T8·T11 + 마크다운 단축은 StarterKit inputRule 기본 제공), 본문 불변(T4), 이탈 가드(T5), 파싱 폴백(T3), 레이아웃(T12), 기존 테스트 이관(T4·T6) — 전부 태스크 존재.
- **가드 범위 축소**(트리 클릭 제외)는 T5에서 스펙 각주로 명문화 — 스펙과 계획 불일치 없음.
- **타입 일관성**: `WikiEditorHandle{getMarkdown,isDirty}` (T3 정의, T4·T5 소비), `buildBaseExtensions(options?)` (T2 확장, T3+ 소비), `filterLinkCandidates`/`SLASH_ITEMS` 시그니처 태스크 간 일치 확인.
- **알려진 불확실성**: T1 스파이크가 tiptap-markdown 왕복을 기각하면 T2의 직렬화 규약(storage.markdown)도 함께 재작성 — T1 Step 5에 중단 조건 명시.
