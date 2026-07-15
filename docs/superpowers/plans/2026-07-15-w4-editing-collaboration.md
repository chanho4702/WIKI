# W4 편집 완성도 + 협업 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위키에 트리 드래그 정렬(페이지 이동), [[제목]] 페이지 링크+자동완성, 코멘트 수정/삭제/답글, 버전 diff 비교를 추가한다.

**Architecture:** 화면은 `wikiStore.ts`의 async 함수만 호출(스토어 교체 지점 유지). diff·링크 변환·DnD 투영은 순수 함수로 분리해 단위 테스트한다. UI는 @chanho/react 디자인 시스템만 사용, 신규 의존성은 @dnd-kit 3개 패키지뿐.

**Tech Stack:** Vite 7 + React 19 + TS strict + react-router 7 + @chanho/react·tokens + react-markdown + Vitest/RTL + (신규) @dnd-kit/core·sortable·utilities

**Spec:** `docs/superpowers/specs/2026-07-15-w4-editing-collaboration-design.md`

## Global Constraints

- 패키지 매니저는 **pnpm** (pnpm-lock.yaml 존재)
- UI는 100% 디자인 시스템(@chanho/react) — MUI 등 타 UI 라이브러리 금지. 앱 로컬 CSS는 `src/app/app.css`에 `--chanho-*` 토큰 변수만 사용
- 도메인 규칙 위반은 **한국어 메시지로 throw**, 화면은 Toast(danger)로 표시
- localStorage 키는 `wiki.v1` 유지 — 스토리지 마이그레이션 없이 load 시 정규화
- 페이지 **이동은 버전 스냅샷을 만들지 않고** updatedBy/updatedAt도 갱신하지 않는다
- 코멘트 답글은 **중첩 1단** — 답글에 답글 금지
- 게이트: `pnpm typecheck` + `pnpm test` + `pnpm build` 전부 통과 후 커밋
- 테스트 파일 관례: 스토어는 `beforeEach(() => { localStorage.clear(); __resetForTest(); })`, 화면은 `src/app/testUtils.tsx`의 `renderApp(initialPath)` 사용
- 시드 데이터 트리(테스트에서 참조): sp1 스페이스에 pg1"시작하기"(루트1, v1·v2 두 버전) / pg2"팀 규칙"(루트2) / pg3"개발 환경 설정"(pg1 하위1) / pg4"배포 가이드"(pg1 하위2) / pg5"로컬 DB 설정"(pg3 하위). 코멘트 c1(u2 작성)·c2(u3 작성)는 pg1에. 현재 유저는 u1(김찬호)

---

### Task 1: Comment 타입 확장 + load 정규화 + 시드 갱신

**Files:**
- Modify: `src/features/wiki/store/types.ts` (Comment 인터페이스)
- Modify: `src/features/wiki/store/wikiStore.ts` (load에 normalize 추가)
- Modify: `src/mock/seed.ts` (코멘트 신규 필드)
- Test: `src/features/wiki/store/wikiStore.comments.test.ts` (기존 파일에 추가)

**Interfaces:**
- Produces: `Comment.parentId: string | null`, `Comment.updatedAt: string | null` — Task 3·5가 사용

- [ ] **Step 1: 실패하는 테스트 작성** — `wikiStore.comments.test.ts`의 `describe("comments", ...)` 안에 추가:

```ts
it("구버전 데이터(parentId/updatedAt 없는 코멘트)를 load 시 null로 정규화한다", async () => {
  localStorage.setItem(
    "wiki.v1",
    JSON.stringify({
      users: [{ id: "u1", name: "김찬호" }],
      spaces: [{ id: "sp1", key: "DEV", name: "개발 위키", createdAt: "2026-07-10T09:00:00.000Z" }],
      pages: [{ id: "pg1", spaceId: "sp1", parentId: null, title: "시작하기", body: "", position: 1, createdBy: "u1", updatedBy: "u1", createdAt: "2026-07-10T09:00:00.000Z", updatedAt: "2026-07-10T09:00:00.000Z" }],
      versions: [],
      comments: [{ id: "c1", pageId: "pg1", authorId: "u1", body: "구버전 코멘트", createdAt: "2026-07-10T11:00:00.000Z" }],
    }),
  );
  const comments = await listComments("pg1");
  expect(comments).toHaveLength(1);
  expect(comments[0].parentId).toBeNull();
  expect(comments[0].updatedAt).toBeNull();
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/features/wiki/store/wikiStore.comments.test.ts`
Expected: FAIL — `expect(comments[0].parentId).toBeNull()`에서 undefined

- [ ] **Step 3: 구현**

`types.ts`의 Comment를 다음으로 교체:

```ts
export interface Comment {
  id: string;
  pageId: string;
  authorId: string;
  body: string;
  parentId: string | null; // null = 최상위, 값 있으면 답글 (중첩 1단 제한)
  createdAt: string;
  updatedAt: string | null; // 수정된 적 없으면 null — "(수정됨)" 표시 근거
}
```

`wikiStore.ts` — `isWikiData` 아래에 normalize 추가, `load()`의 `if (isWikiData(parsed)) cache = parsed;`를 `cache = normalize(parsed);`로 교체:

```ts
/** 구버전 데이터 호환: W4에서 추가된 코멘트 필드(parentId/updatedAt)를 null로 채운다 */
function normalize(data: WikiData): WikiData {
  for (const comment of data.comments) {
    comment.parentId ??= null;
    comment.updatedAt ??= null;
  }
  return data;
}
```

기존 `addComment`의 comment 리터럴에 `parentId: null,`과 `updatedAt: null,` 필드 추가(타입 오류 해소 — parentId 파라미터화는 Task 3).

`seed.ts`의 comments 배열을 다음으로 교체:

```ts
const comments: Comment[] = [
  { id: "c1", pageId: "pg1", authorId: "u2", body: "온보딩에 딱 필요한 내용이네요.", parentId: null, createdAt: T_COMMENT_1, updatedAt: null },
  { id: "c2", pageId: "pg1", authorId: "u3", body: "배포 가이드 링크도 추가하면 좋겠습니다.", parentId: null, createdAt: T_COMMENT_2, updatedAt: null },
];
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm typecheck` 그리고 `pnpm test`
Expected: 전부 PASS (기존 테스트 포함)

- [ ] **Step 5: 커밋**

```bash
git add src/features/wiki/store/types.ts src/features/wiki/store/wikiStore.ts src/mock/seed.ts src/features/wiki/store/wikiStore.comments.test.ts
git commit -m "feat(store): Comment에 parentId/updatedAt 추가 + 구버전 데이터 load 정규화"
```

---

### Task 2: movePage 스토어 함수

**Files:**
- Modify: `src/features/wiki/store/wikiStore.ts`
- Test: `src/features/wiki/store/wikiStore.move.test.ts` (신규)

**Interfaces:**
- Produces: `movePage(id: string, target: { parentId: string | null; beforeId?: string | null }): Promise<Page>` — Task 11이 사용

- [ ] **Step 1: 실패하는 테스트 작성** — `wikiStore.move.test.ts` 신규 (전체 파일):

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, createPage, createSpace, getPage, listPages, listVersions, movePage } from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

/** spaceId의 페이지 중 parentId가 일치하는 것을 position 순으로 반환 */
async function siblings(spaceId: string, parentId: string | null) {
  return (await listPages(spaceId)).filter((p) => p.parentId === parentId);
}

describe("movePage", () => {
  it("같은 부모 안에서 beforeId 앞으로 이동하고 position을 1..n으로 재부여한다", async () => {
    await movePage("pg2", { parentId: null, beforeId: "pg1" });
    const roots = await siblings("sp1", null);
    expect(roots.map((p) => p.id)).toEqual(["pg2", "pg1"]);
    expect(roots.map((p) => p.position)).toEqual([1, 2]);
  });

  it("beforeId 없으면 새 부모의 맨 뒤로 이동한다", async () => {
    await movePage("pg3", { parentId: null }); // pg1 하위 → 루트 맨 뒤
    const roots = await siblings("sp1", null);
    expect(roots.map((p) => p.id)).toEqual(["pg1", "pg2", "pg3"]);
    const moved = await getPage("pg3");
    expect(moved?.parentId).toBeNull();
    // 원래 형제(pg4)의 상대 순서는 유지된다
    expect((await siblings("sp1", "pg1")).map((p) => p.id)).toEqual(["pg4"]);
  });

  it("자기 자신을 부모로 지정하면 거부한다", async () => {
    await expect(movePage("pg1", { parentId: "pg1" })).rejects.toThrow(
      "페이지를 자신의 하위로 이동할 수 없습니다",
    );
  });

  it("자기 자손(손자) 밑으로 이동하면 거부한다", async () => {
    await expect(movePage("pg1", { parentId: "pg5" })).rejects.toThrow(
      "페이지를 자신의 하위로 이동할 수 없습니다",
    );
  });

  it("다른 스페이스의 페이지를 부모로 지정하면 거부한다", async () => {
    const other = await createSpace({ key: "OPS", name: "운영" });
    const otherRoot = await createPage({ spaceId: other.id, title: "운영 홈" });
    await expect(movePage("pg1", { parentId: otherRoot.id })).rejects.toThrow(
      "부모 페이지가 같은 스페이스에 없습니다",
    );
  });

  it("beforeId가 대상 부모의 자식이 아니면 거부한다", async () => {
    // pg3은 루트가 아니라 pg1의 자식이다
    await expect(movePage("pg2", { parentId: null, beforeId: "pg3" })).rejects.toThrow(
      "기준 페이지가 대상 위치에 없습니다",
    );
  });

  it("없는 페이지는 거부한다", async () => {
    await expect(movePage("없는id", { parentId: null })).rejects.toThrow(
      "페이지를 찾을 수 없습니다",
    );
  });

  it("이동은 버전을 만들지 않고 updatedAt도 바꾸지 않는다", async () => {
    const before = await getPage("pg3");
    await movePage("pg3", { parentId: "pg2" });
    const after = await getPage("pg3");
    expect(after?.updatedAt).toBe(before?.updatedAt);
    expect(await listVersions("pg3")).toHaveLength(1); // 시드 v1 그대로
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/features/wiki/store/wikiStore.move.test.ts`
Expected: FAIL — `movePage` export 없음

- [ ] **Step 3: 구현** — `wikiStore.ts`의 pages 섹션(deletePage 아래)에 추가:

```ts
export async function movePage(
  id: string,
  target: { parentId: string | null; beforeId?: string | null },
): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  const parentId = target.parentId;
  if (parentId !== null) {
    const parent = data.pages.find((p) => p.id === parentId);
    if (!parent) throw new Error("부모 페이지를 찾을 수 없습니다");
    if (parent.spaceId !== page.spaceId) {
      throw new Error("부모 페이지가 같은 스페이스에 없습니다");
    }
    // 순환 금지: 새 부모에서 루트까지 올라가는 경로에 자신이 있으면 자손 밑 이동이다
    let cursor: Page | undefined = parent;
    while (cursor) {
      if (cursor.id === page.id) {
        throw new Error("페이지를 자신의 하위로 이동할 수 없습니다");
      }
      const nextId: string | null = cursor.parentId;
      cursor = nextId === null ? undefined : data.pages.find((p) => p.id === nextId);
    }
  }
  // 대상 형제 집합(자신 제외)에 삽입 위치를 정하고 position을 1..n으로 재부여
  const siblings = data.pages
    .filter((p) => p.spaceId === page.spaceId && p.parentId === parentId && p.id !== page.id)
    .sort((a, b) => a.position - b.position);
  const beforeId = target.beforeId ?? null;
  let insertAt = siblings.length;
  if (beforeId !== null) {
    const index = siblings.findIndex((p) => p.id === beforeId);
    if (index === -1) throw new Error("기준 페이지가 대상 위치에 없습니다");
    insertAt = index;
  }
  siblings.splice(insertAt, 0, page);
  page.parentId = parentId;
  siblings.forEach((p, i) => {
    p.position = i + 1;
  });
  // 이동은 내용 변경이 아니다 — 버전 스냅샷 없음, updatedBy/updatedAt 불변
  persist();
  return clone(page);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/features/wiki/store/wikiStore.move.test.ts`
Expected: 8개 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/features/wiki/store/wikiStore.ts src/features/wiki/store/wikiStore.move.test.ts
git commit -m "feat(store): movePage — 부모 변경+형제 정렬, 순환 금지, 버전 무영향"
```

---

### Task 3: 코멘트 스토어 — 답글/수정/삭제

**Files:**
- Modify: `src/features/wiki/store/wikiStore.ts`
- Test: `src/features/wiki/store/wikiStore.comments.test.ts` (추가)

**Interfaces:**
- Consumes: Task 1의 `Comment.parentId`/`updatedAt`
- Produces: `addComment(pageId: string, body: string, parentId?: string | null): Promise<Comment>`, `updateComment(id: string, body: string): Promise<Comment>`, `deleteComment(id: string): Promise<void>` — Task 5가 사용

- [ ] **Step 1: 실패하는 테스트 작성** — `wikiStore.comments.test.ts`에 describe 추가 (import에 `deleteComment, updateComment` 추가):

```ts
describe("comment replies & edit/delete (W4)", () => {
  it("parentId로 답글을 단다", async () => {
    const reply = await addComment("pg1", "답글입니다", "c1");
    expect(reply).toMatchObject({ pageId: "pg1", authorId: "u1", parentId: "c1" });
  });

  it("답글에 답글은 거부한다 (중첩 1단)", async () => {
    const reply = await addComment("pg1", "답글", "c1");
    await expect(addComment("pg1", "답답글", reply.id)).rejects.toThrow(
      "답글에는 답글을 달 수 없습니다",
    );
  });

  it("부모 코멘트가 다른 페이지에 있으면 거부한다", async () => {
    // c1은 pg1의 코멘트다
    await expect(addComment("pg2", "잘못된 답글", "c1")).rejects.toThrow(
      "부모 코멘트가 같은 페이지에 없습니다",
    );
  });

  it("없는 부모 코멘트면 거부한다", async () => {
    await expect(addComment("pg1", "답글", "없는id")).rejects.toThrow(
      "부모 코멘트를 찾을 수 없습니다",
    );
  });

  it("본인 코멘트를 수정하면 body와 updatedAt이 갱신된다", async () => {
    const mine = await addComment("pg2", "원본");
    const updated = await updateComment(mine.id, "  수정본  ");
    expect(updated.body).toBe("수정본");
    expect(updated.updatedAt).not.toBeNull();
  });

  it("무변경 수정은 no-op — updatedAt이 null로 남는다", async () => {
    const mine = await addComment("pg2", "그대로");
    const updated = await updateComment(mine.id, "그대로");
    expect(updated.updatedAt).toBeNull();
  });

  it("타인 코멘트 수정은 거부한다", async () => {
    // c1의 작성자는 u2, 현재 유저는 u1
    await expect(updateComment("c1", "가로채기")).rejects.toThrow(
      "본인의 코멘트만 수정할 수 있습니다",
    );
  });

  it("빈 본문 수정은 거부한다", async () => {
    const mine = await addComment("pg2", "원본");
    await expect(updateComment(mine.id, "   ")).rejects.toThrow("코멘트 내용을 입력하세요");
  });

  it("본인 코멘트를 삭제하면 그 답글도 연쇄 삭제된다", async () => {
    const mine = await addComment("pg2", "삭제될 코멘트");
    await addComment("pg2", "답글1", mine.id);
    await addComment("pg2", "답글2", mine.id);
    await deleteComment(mine.id);
    await expect(listComments("pg2")).resolves.toEqual([]);
  });

  it("타인 코멘트 삭제는 거부한다", async () => {
    await expect(deleteComment("c1")).rejects.toThrow("본인의 코멘트만 삭제할 수 있습니다");
  });

  it("없는 코멘트 수정/삭제는 거부한다", async () => {
    await expect(updateComment("없는id", "x")).rejects.toThrow("코멘트를 찾을 수 없습니다");
    await expect(deleteComment("없는id")).rejects.toThrow("코멘트를 찾을 수 없습니다");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/features/wiki/store/wikiStore.comments.test.ts`
Expected: FAIL — `updateComment`/`deleteComment` export 없음, 답글 케이스 실패

- [ ] **Step 3: 구현** — `wikiStore.ts`의 addComment를 교체하고 아래 두 함수 추가:

```ts
export async function addComment(
  pageId: string,
  body: string,
  parentId?: string | null,
): Promise<Comment> {
  const data = load();
  if (!data.pages.some((p) => p.id === pageId)) {
    throw new Error("페이지를 찾을 수 없습니다");
  }
  const resolvedParentId = parentId ?? null;
  if (resolvedParentId !== null) {
    const parent = data.comments.find((c) => c.id === resolvedParentId);
    if (!parent) throw new Error("부모 코멘트를 찾을 수 없습니다");
    if (parent.pageId !== pageId) throw new Error("부모 코멘트가 같은 페이지에 없습니다");
    if (parent.parentId !== null) throw new Error("답글에는 답글을 달 수 없습니다");
  }
  const trimmed = body.trim();
  if (!trimmed) throw new Error("코멘트 내용을 입력하세요");
  const comment: Comment = {
    id: nextId(),
    pageId,
    authorId: CURRENT_USER_ID,
    body: trimmed,
    parentId: resolvedParentId,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
  data.comments.push(comment);
  persist();
  return clone(comment);
}

export async function updateComment(id: string, body: string): Promise<Comment> {
  const data = load();
  const comment = data.comments.find((c) => c.id === id);
  if (!comment) throw new Error("코멘트를 찾을 수 없습니다");
  if (comment.authorId !== CURRENT_USER_ID) {
    throw new Error("본인의 코멘트만 수정할 수 있습니다");
  }
  const trimmed = body.trim();
  if (!trimmed) throw new Error("코멘트 내용을 입력하세요");
  if (trimmed === comment.body) return clone(comment); // 무변경 no-op
  comment.body = trimmed;
  comment.updatedAt = new Date().toISOString();
  persist();
  return clone(comment);
}

export async function deleteComment(id: string): Promise<void> {
  const data = load();
  const comment = data.comments.find((c) => c.id === id);
  if (!comment) throw new Error("코멘트를 찾을 수 없습니다");
  if (comment.authorId !== CURRENT_USER_ID) {
    throw new Error("본인의 코멘트만 삭제할 수 있습니다");
  }
  // 최상위 코멘트면 그 답글도 연쇄 삭제
  data.comments = data.comments.filter((c) => c.id !== id && c.parentId !== id);
  persist();
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/features/wiki/store/wikiStore.comments.test.ts`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/features/wiki/store/wikiStore.ts src/features/wiki/store/wikiStore.comments.test.ts
git commit -m "feat(store): 코멘트 답글(1단)·수정·삭제 — 본인 검증, 답글 연쇄 삭제"
```

---

### Task 4: lineDiff 유틸

**Files:**
- Create: `src/features/wiki/lib/lineDiff.ts`
- Test: `src/features/wiki/lib/lineDiff.test.ts` (신규)

**Interfaces:**
- Produces: `interface DiffLine { kind: "same" | "added" | "removed"; text: string }`, `lineDiff(oldText: string, newText: string): DiffLine[]` — Task 6이 사용

- [ ] **Step 1: 실패하는 테스트 작성** — `lineDiff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lineDiff } from "./lineDiff";

describe("lineDiff", () => {
  it("동일 텍스트는 전부 same", () => {
    expect(lineDiff("a\nb", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
    ]);
  });

  it("빈 문자열 → 내용은 전부 added", () => {
    expect(lineDiff("", "a\nb")).toEqual([
      { kind: "added", text: "a" },
      { kind: "added", text: "b" },
    ]);
  });

  it("내용 → 빈 문자열은 전부 removed", () => {
    expect(lineDiff("a\nb", "")).toEqual([
      { kind: "removed", text: "a" },
      { kind: "removed", text: "b" },
    ]);
  });

  it("중간 라인 교체는 removed가 added보다 먼저 온다", () => {
    expect(lineDiff("a\nx\nb", "a\ny\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "x" },
      { kind: "added", text: "y" },
      { kind: "same", text: "b" },
    ]);
  });

  it("둘 다 빈 문자열이면 빈 배열", () => {
    expect(lineDiff("", "")).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/features/wiki/lib/lineDiff.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `lineDiff.ts`:

```ts
export interface DiffLine {
  kind: "same" | "added" | "removed";
  text: string;
}

/**
 * 라인 단위 diff — LCS(최장 공통 부분열) DP 후 역추적.
 * removed를 added보다 먼저 배출한다(통상 diff 관례).
 */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText === "" ? [] : oldText.split("\n");
  const b = newText === "" ? [] : newText.split("\n");
  const m = a.length;
  const n = b.length;
  // dp[i][j] = a[i..] 와 b[j..] 의 LCS 길이
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ kind: "removed", text: a[i] });
      i++;
    } else {
      result.push({ kind: "added", text: b[j] });
      j++;
    }
  }
  while (i < m) result.push({ kind: "removed", text: a[i++] });
  while (j < n) result.push({ kind: "added", text: b[j++] });
  return result;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/features/wiki/lib/lineDiff.test.ts`
Expected: 5개 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/features/wiki/lib/lineDiff.ts src/features/wiki/lib/lineDiff.test.ts
git commit -m "feat(lib): lineDiff — LCS 기반 라인 단위 diff 유틸"
```

---

### Task 5: CommentSection — 답글/수정/삭제 UI

**Files:**
- Modify: `src/features/wiki/components/CommentSection.tsx` (전면 개편)
- Modify: `src/app/app.css` (클래스 추가)
- Test: `src/app/App.w4-comments.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 3의 `addComment(pageId, body, parentId?)`, `updateComment(id, body)`, `deleteComment(id)`, `getCurrentUser()`
- Produces: 없음 (말단 UI)

- [ ] **Step 1: 실패하는 테스트 작성** — `App.w4-comments.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, addComment } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openPg1Comments() {
  renderApp("/spaces/sp1/pages/pg1");
  await screen.findByRole("heading", { level: 1, name: "시작하기" });
  return screen.findByRole("region", { name: "코멘트" });
}

describe("W4 코멘트 답글/수정/삭제", () => {
  it("답글 버튼으로 답글을 달면 부모 아래 들여쓰기 영역에 보인다", async () => {
    const user = userEvent.setup();
    const region = await openPg1Comments();
    // 최상위 c1, c2 두 개 → 답글 버튼도 2개 (답글에는 없음)
    await user.click(within(region).getAllByRole("button", { name: "답글" })[0]);
    await user.type(within(region).getByLabelText("답글 작성"), "동의합니다");
    await user.click(within(region).getByRole("button", { name: "답글 남기기" }));
    const replies = await within(region).findAllByTestId("comment-replies");
    expect(within(replies[0]).getByText("동의합니다")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (3)" })).toBeInTheDocument();
    // 답글에는 답글 버튼이 생기지 않는다 (여전히 최상위 2개뿐)
    expect(within(region).getAllByRole("button", { name: "답글" })).toHaveLength(2);
  });

  it("본인 코멘트만 수정/삭제 버튼이 보이고, 수정하면 (수정됨)이 붙는다", async () => {
    const user = userEvent.setup();
    await addComment("pg1", "내가 쓴 코멘트"); // 현재 유저 u1
    const region = await openPg1Comments();
    // 시드 c1(u2)·c2(u3)에는 수정/삭제가 없다 — 내 코멘트 1개에만
    expect(within(region).getAllByRole("button", { name: "수정" })).toHaveLength(1);
    expect(within(region).getAllByRole("button", { name: "삭제" })).toHaveLength(1);
    await user.click(within(region).getByRole("button", { name: "수정" }));
    const editor = within(region).getByLabelText("코멘트 수정");
    expect(editor).toHaveValue("내가 쓴 코멘트");
    await user.clear(editor);
    await user.type(editor, "고친 코멘트");
    await user.click(within(region).getByRole("button", { name: "저장" }));
    expect(await within(region).findByText("고친 코멘트")).toBeInTheDocument();
    expect(within(region).getByText(/\(수정됨\)/)).toBeInTheDocument();
  });

  it("삭제는 확인 후 진행되고 목록에서 사라진다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await addComment("pg1", "지울 코멘트");
    const region = await openPg1Comments();
    await user.click(within(region).getByRole("button", { name: "삭제" }));
    expect(window.confirm).toHaveBeenCalled();
    await within(region).findByRole("heading", { name: "코멘트 (2)" });
    expect(within(region).queryByText("지울 코멘트")).not.toBeInTheDocument();
  });

  it("confirm을 취소하면 삭제하지 않는다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await addComment("pg1", "남을 코멘트");
    const region = await openPg1Comments();
    await user.click(within(region).getByRole("button", { name: "삭제" }));
    expect(within(region).getByText("남을 코멘트")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (3)" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/app/App.w4-comments.test.tsx`
Expected: FAIL — "답글" 버튼 없음

- [ ] **Step 3: 구현** — `CommentSection.tsx` 전체 교체:

```tsx
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Avatar, Button, Comment as CommentBlock, Spinner, TextArea, useToast } from "@chanho/react";
import type { Comment, User } from "../store/types";
import { addComment, deleteComment, getCurrentUser, listComments, updateComment } from "../store/wikiStore";

export interface CommentSectionProps {
  pageId: string;
  /** 작성자 이름 표시용 — PageViewPage가 이미 로드한 목록 재사용 */
  users: User[];
}

/** 코멘트 시각 표기: ko-KR 날짜+시간 */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR");
}

/** 페이지 하단 코멘트 — 최상위 목록 + 답글 1단 + 본인 수정/삭제. */
export function CommentSection({ pageId, users }: CommentSectionProps) {
  // null = 로딩 중
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const toast = useToast();

  useEffect(() => {
    void getCurrentUser().then((me) => setMeId(me.id));
  }, []);

  useEffect(() => {
    setComments(null);
    setDraft("");
    setReplyTo(null);
    setEditingId(null);
    void listComments(pageId).then(setComments);
  }, [pageId]);

  const reload = async () => setComments(await listComments(pageId));
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "알 수 없음";
  const fail = (title: string, error: unknown) =>
    toast({
      title,
      description: error instanceof Error ? error.message : String(error),
      appearance: "danger",
    });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await addComment(pageId, draft); // 빈 본문은 스토어가 throw
      setDraft("");
      await reload();
      toast({ title: "코멘트를 남겼습니다", appearance: "success" });
    } catch (error) {
      fail("코멘트 작성 실패", error);
    }
  };

  const handleReplySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!replyTo) return;
    try {
      await addComment(pageId, replyDraft, replyTo);
      setReplyDraft("");
      setReplyTo(null);
      await reload();
      toast({ title: "답글을 남겼습니다", appearance: "success" });
    } catch (error) {
      fail("답글 작성 실패", error);
    }
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    try {
      await updateComment(editingId, editDraft);
      setEditingId(null);
      await reload();
      toast({ title: "코멘트를 수정했습니다", appearance: "success" });
    } catch (error) {
      fail("코멘트 수정 실패", error);
    }
  };

  const handleDelete = async (comment: Comment, replyCount: number) => {
    const message =
      replyCount > 0
        ? `답글 ${replyCount}개도 함께 삭제됩니다. 코멘트를 삭제할까요?`
        : "코멘트를 삭제할까요?";
    if (!window.confirm(message)) return;
    try {
      await deleteComment(comment.id);
      await reload();
      toast({ title: "코멘트를 삭제했습니다", appearance: "success" });
    } catch (error) {
      fail("코멘트 삭제 실패", error);
    }
  };

  if (comments === null) {
    return <Spinner size="small" label="코멘트 로딩 중" />;
  }

  const topLevel = comments.filter((c) => c.parentId === null);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  /** replies가 null이면 답글(들여쓰기 항목) — 답글 버튼과 하위 목록을 렌더하지 않는다 */
  const renderComment = (comment: Comment, replies: Comment[] | null) => (
    <CommentBlock
      key={comment.id}
      author={userName(comment.authorId)}
      avatar={<Avatar name={userName(comment.authorId)} size="small" />}
      time={formatDateTime(comment.createdAt) + (comment.updatedAt ? " (수정됨)" : "")}
    >
      {editingId === comment.id ? (
        <div className="comment-edit">
          <TextArea
            label="코멘트 수정"
            rows={2}
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
          />
          <div className="comment-actions">
            <Button size="small" onClick={handleEditSave}>
              저장
            </Button>
            <Button size="small" variant="subtle" onClick={() => setEditingId(null)}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <>
          <span data-testid="comment-body">{comment.body}</span>
          <div className="comment-actions">
            {replies !== null ? (
              <Button
                size="small"
                variant="ghost"
                onClick={() => {
                  setReplyTo(comment.id);
                  setReplyDraft("");
                }}
              >
                답글
              </Button>
            ) : null}
            {comment.authorId === meId ? (
              <>
                <Button
                  size="small"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(comment.id);
                    setEditDraft(comment.body);
                  }}
                >
                  수정
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  onClick={() => void handleDelete(comment, replies?.length ?? 0)}
                >
                  삭제
                </Button>
              </>
            ) : null}
          </div>
        </>
      )}
      {replies !== null && replies.length > 0 ? (
        <div className="comment-replies" data-testid="comment-replies">
          {replies.map((reply) => renderComment(reply, null))}
        </div>
      ) : null}
      {replies !== null && replyTo === comment.id ? (
        <form className="comment-form" onSubmit={handleReplySubmit}>
          <TextArea
            label="답글 작성"
            rows={2}
            placeholder="답글을 입력하세요"
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
          />
          <div className="comment-actions">
            <Button type="submit" size="small">
              답글 남기기
            </Button>
            <Button size="small" variant="subtle" onClick={() => setReplyTo(null)}>
              취소
            </Button>
          </div>
        </form>
      ) : null}
    </CommentBlock>
  );

  return (
    <section className="comment-section" aria-label="코멘트">
      <h2 className="comment-section-title">코멘트 ({comments.length})</h2>
      {topLevel.map((comment) => renderComment(comment, repliesOf(comment.id)))}
      {comments.length === 0 ? <p className="comment-empty">아직 코멘트가 없습니다</p> : null}
      <form className="comment-form" onSubmit={handleSubmit}>
        <TextArea
          label="코멘트 작성"
          rows={3}
          placeholder="코멘트를 입력하세요"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" size="small">
          코멘트 남기기
        </Button>
      </form>
    </section>
  );
}
```

`app.css` 끝에 추가:

```css
/* W4: 코멘트 답글/수정 */
.comment-actions {
  display: flex;
  gap: var(--chanho-space-100);
  margin-top: var(--chanho-space-100);
}

.comment-replies {
  margin-top: var(--chanho-space-200);
  margin-left: var(--chanho-space-400);
  padding-left: var(--chanho-space-200);
  border-left: 2px solid var(--chanho-color-border-default);
}

.comment-edit {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-100);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test`
Expected: 신규 4개 포함 전부 PASS — 기존 `App.w3-comments.test.tsx`도 그대로 통과해야 한다(시드 불변)

- [ ] **Step 5: 커밋**

```bash
git add src/features/wiki/components/CommentSection.tsx src/app/app.css src/app/App.w4-comments.test.tsx
git commit -m "feat(comments): 답글 1단·본인 수정/삭제 UI — confirm 후 삭제, (수정됨) 표시"
```

---

### Task 6: DiffView + HistoryModal 변경사항 탭

**Files:**
- Create: `src/features/wiki/components/DiffView.tsx`
- Modify: `src/features/wiki/components/HistoryModal.tsx`
- Modify: `src/app/app.css`
- Test: `src/app/App.w4-history-diff.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 4의 `lineDiff`
- Produces: `DiffView({ oldText, newText })` 컴포넌트

- [ ] **Step 1: 실패하는 테스트 작성** — `App.w4-history-diff.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, updatePage } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W4 버전 diff", () => {
  it("최신 버전의 변경사항 탭이 직전 버전과의 라인 diff를 보여준다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1"); // pg1은 v1/v2 두 버전
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    await user.click(await screen.findByRole("tab", { name: "변경사항" }));
    const diff = await screen.findByTestId("diff-view");
    // v1에만 있던 라인은 removed, v2에 새로 들어온 라인은 added
    expect(within(diff).getByText("초기 안내 문서입니다.")).toHaveClass("diff-removed");
    expect(within(diff).getByText("## 시작 순서")).toHaveClass("diff-added");
  });

  it("v1을 선택하면 전체가 added로 표시된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    await user.click(await screen.findByRole("button", { name: /v1/ }));
    await user.click(screen.getByRole("tab", { name: "변경사항" }));
    const diff = await screen.findByTestId("diff-view");
    expect(within(diff).getByText("# 개발 위키")).toHaveClass("diff-added");
    expect(within(diff).getByText("초기 안내 문서입니다.")).toHaveClass("diff-added");
  });

  it("제목이 바뀐 버전은 제목 변경 한 줄을 표시한다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { title: "팀 규칙 개정판" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙 개정판" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    await user.click(await screen.findByRole("tab", { name: "변경사항" }));
    expect(await screen.findByText("제목: 팀 규칙 → 팀 규칙 개정판")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/app/App.w4-history-diff.test.tsx`
Expected: FAIL — "변경사항" 탭 없음

- [ ] **Step 3: 구현**

`DiffView.tsx` 신규:

```tsx
import { lineDiff } from "../lib/lineDiff";

export interface DiffViewProps {
  oldText: string;
  newText: string;
}

/** 라인 diff 표시 — +/- 마커는 CSS ::before로 붙여 텍스트 매칭(테스트)을 깨지 않는다. */
export function DiffView({ oldText, newText }: DiffViewProps) {
  const lines = lineDiff(oldText, newText);
  if (lines.length === 0) {
    return <p className="diff-empty">내용 없음</p>;
  }
  return (
    <pre className="diff-view" data-testid="diff-view">
      {lines.map((line, index) => (
        <div key={index} className={`diff-line diff-${line.kind}`}>
          {line.text}
        </div>
      ))}
    </pre>
  );
}
```

`HistoryModal.tsx` — import에 `Tabs`(@chanho/react)와 `DiffView` 추가, `history-preview` 블록을 다음으로 교체:

```tsx
{selected ? (
  <div className="history-preview">
    <h2>{selected.title}</h2>
    {(() => {
      // 직전 버전 — v1이면 없음(전체 added)
      const previous = versions?.find((v) => v.version === selected.version - 1) ?? null;
      return (
        <Tabs
          label="버전 미리보기"
          items={[
            {
              value: "content",
              label: "내용",
              content: <MarkdownView markdown={selected.body} />,
            },
            {
              value: "diff",
              label: "변경사항",
              content: (
                <>
                  {previous && previous.title !== selected.title ? (
                    <p className="diff-title-change">
                      제목: {previous.title} → {selected.title}
                    </p>
                  ) : null}
                  <DiffView oldText={previous?.body ?? ""} newText={selected.body} />
                </>
              ),
            },
          ]}
        />
      );
    })()}
    <Button onClick={handleRestore}>이 버전으로 복원</Button>
  </div>
) : null}
```

`app.css` 끝에 추가:

```css
/* W4: 버전 diff */
.diff-view {
  margin: 0;
  padding: var(--chanho-space-200);
  overflow-x: auto;
  font-size: var(--chanho-font-size-100);
  border: 1px solid var(--chanho-color-border-default);
  border-radius: var(--chanho-radius-medium);
}

.diff-line::before {
  content: " ";
  display: inline-block;
  width: 1.2em;
}

.diff-added {
  background: var(--chanho-color-background-success-subtle);
}

.diff-added::before {
  content: "+";
}

.diff-removed {
  background: var(--chanho-color-background-danger-subtle);
}

.diff-removed::before {
  content: "-";
}

.diff-title-change {
  font-weight: var(--chanho-font-weight-semibold);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test`
Expected: 신규 3개 포함 전부 PASS (기존 히스토리 복원 테스트 `App.w3-history.test.tsx` 포함 — 미리보기 본문이 탭 안으로 이동했으므로 깨지면 해당 테스트의 본문 조회를 탭 클릭 후로 수정한다: `await user.click(screen.getByRole("tab", { name: "내용" }))` 추가가 아니라, Tabs는 첫 탭(내용)이 기본 선택이므로 원칙적으로 그대로 통과해야 한다)

- [ ] **Step 5: 커밋**

```bash
git add src/features/wiki/components/DiffView.tsx src/features/wiki/components/HistoryModal.tsx src/app/app.css src/app/App.w4-history-diff.test.tsx
git commit -m "feat(history): 변경사항 탭 — 직전 버전과 라인 diff + 제목 변경 표시"
```

---

### Task 7: wikiLinks 변환 유틸 (순수 함수)

**Files:**
- Create: `src/features/wiki/lib/wikiLinks.ts`
- Test: `src/features/wiki/lib/wikiLinks.test.ts` (신규)

**Interfaces:**
- Produces: `resolveWikiLinks(markdown: string, pages: Page[], spaceId: string): string` — Task 8이 사용. 존재하는 제목은 `[제목](/spaces/<sid>/pages/<pid>)`, 없는 제목은 `[제목](/spaces/<sid>/pages/new?title=<인코딩>)`으로 치환

- [ ] **Step 1: 실패하는 테스트 작성** — `wikiLinks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Page } from "../store/types";
import { resolveWikiLinks } from "./wikiLinks";

const base = {
  spaceId: "sp1",
  parentId: null,
  body: "",
  position: 1,
  createdBy: "u1",
  updatedBy: "u1",
  createdAt: "2026-07-10T09:00:00.000Z",
  updatedAt: "2026-07-10T09:00:00.000Z",
};
const PAGES: Page[] = [
  { ...base, id: "pg1", title: "시작하기" },
  { ...base, id: "pg2", title: "팀 규칙" },
];

describe("resolveWikiLinks", () => {
  it("존재하는 제목은 페이지 경로 링크로 바꾼다", () => {
    expect(resolveWikiLinks("[[시작하기]] 참고", PAGES, "sp1")).toBe(
      "[시작하기](/spaces/sp1/pages/pg1) 참고",
    );
  });

  it("제목 매칭은 대소문자·양끝 공백을 무시한다", () => {
    const pages: Page[] = [{ ...base, id: "pgX", title: "API Guide" }];
    expect(resolveWikiLinks("[[ api guide ]]", pages, "sp1")).toBe(
      "[api guide](/spaces/sp1/pages/pgX)",
    );
  });

  it("없는 제목은 생성 화면 링크(title 프리필)로 바꾼다", () => {
    expect(resolveWikiLinks("[[운영 런북]]", PAGES, "sp1")).toBe(
      `[운영 런북](/spaces/sp1/pages/new?title=${encodeURIComponent("운영 런북")})`,
    );
  });

  it("인라인 코드와 코드 펜스 안은 치환하지 않는다", () => {
    const md = "`[[시작하기]]` 그리고\n```\n[[시작하기]]\n```\n[[시작하기]]";
    expect(resolveWikiLinks(md, PAGES, "sp1")).toBe(
      "`[[시작하기]]` 그리고\n```\n[[시작하기]]\n```\n[시작하기](/spaces/sp1/pages/pg1)",
    );
  });

  it("중복 제목은 첫 페이지로 링크한다", () => {
    const pages: Page[] = [
      { ...base, id: "pgA", title: "중복" },
      { ...base, id: "pgB", title: "중복" },
    ];
    expect(resolveWikiLinks("[[중복]]", pages, "sp1")).toBe("[중복](/spaces/sp1/pages/pgA)");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/features/wiki/lib/wikiLinks.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `wikiLinks.ts`:

```ts
import type { Page } from "../store/types";

/** 코드 펜스(```)와 인라인 코드(`)를 분리해 코드 밖에서만 치환하기 위한 분할 패턴 */
const CODE_SPLIT = /(```[\s\S]*?```|`[^`\n]*`)/;
const WIKI_LINK = /\[\[([^[\]\n]+)\]\]/g;

/**
 * [[제목]] → 마크다운 링크 치환.
 * 같은 스페이스에서 제목 정확 일치(대소문자·양끝 공백 무시, 중복이면 첫 페이지).
 * 없는 제목은 생성 화면 경로(new?title=) — MarkdownView가 danger 스타일을 입힌다.
 */
export function resolveWikiLinks(markdown: string, pages: Page[], spaceId: string): string {
  const byTitle = new Map<string, Page>();
  for (const page of pages) {
    const key = page.title.trim().toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, page);
  }
  return markdown
    .split(CODE_SPLIT)
    .map((segment, index) => {
      if (index % 2 === 1) return segment; // 홀수 인덱스 = 코드 구간
      return segment.replace(WIKI_LINK, (_match, raw: string) => {
        const title = raw.trim();
        const target = byTitle.get(title.toLowerCase());
        return target
          ? `[${title}](/spaces/${spaceId}/pages/${target.id})`
          : `[${title}](/spaces/${spaceId}/pages/new?title=${encodeURIComponent(title)})`;
      });
    })
    .join("");
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/features/wiki/lib/wikiLinks.test.ts`
Expected: 5개 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/features/wiki/lib/wikiLinks.ts src/features/wiki/lib/wikiLinks.test.ts
git commit -m "feat(lib): resolveWikiLinks — [[제목]] 치환, 코드 구간 제외, 부재 시 생성 링크"
```

---

### Task 8: MarkdownView 위키링크 렌더 + 화면 연결 + 제목 프리필

**Files:**
- Modify: `src/features/wiki/components/MarkdownView.tsx`
- Modify: `src/features/wiki/pages/PageViewPage.tsx` (MarkdownView 호출부)
- Modify: `src/features/wiki/pages/PageEditPage.tsx` (title 프리필 + 미리보기 연결)
- Modify: `src/app/app.css`
- Test: `src/app/App.w4-links.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 7의 `resolveWikiLinks`
- Produces: `MarkdownViewProps`에 옵션 `pages?: Page[]`, `spaceId?: string` 추가(둘 다 주어질 때만 위키링크 모드) — Task 9의 미리보기도 동일 계약 사용

- [ ] **Step 1: 실패하는 테스트 작성** — `App.w4-links.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, updatePage } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W4 [[제목]] 페이지 링크", () => {
  it("존재하는 제목은 페이지 링크로 렌더되고 클릭하면 이동한다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { body: "[[시작하기]] 문서를 참고하세요" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    const article = screen.getByRole("article"); // 사이드바 NavLink와 구분
    const link = within(article).getByRole("link", { name: "시작하기" });
    expect(link).toHaveAttribute("href", "/spaces/sp1/pages/pg1");
    expect(link).not.toHaveClass("wiki-link-missing");
    await user.click(link);
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
  });

  it("없는 제목은 danger 스타일 링크로 렌더되고 클릭하면 제목이 채워진 생성 화면으로 간다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { body: "[[운영 런북]]을 먼저 만들자" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    const article = screen.getByRole("article");
    const link = within(article).getByRole("link", { name: "운영 런북" });
    expect(link).toHaveClass("wiki-link-missing");
    await user.click(link);
    expect(await screen.findByLabelText("제목")).toHaveValue("운영 런북");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/app/App.w4-links.test.tsx`
Expected: FAIL — `[[시작하기]]`가 일반 텍스트로 렌더됨(link role 없음)

- [ ] **Step 3: 구현**

`MarkdownView.tsx` 전체 교체:

```tsx
import type { AnchorHTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router";
import type { Page } from "../store/types";
import { resolveWikiLinks } from "../lib/wikiLinks";

export interface MarkdownViewProps {
  /** 마크다운 원문 (Page.body 또는 편집 중인 입력값) */
  markdown: string;
  /** spaceId와 함께 주어지면 [[제목]]을 페이지 링크로 렌더한다 (같은 스페이스의 pages) */
  pages?: Page[];
  spaceId?: string;
}

/** 내부 경로(/...)는 react-router Link로, 생성 링크(new?title=)는 danger 스타일로 렌더 */
function WikiAnchor({
  href = "",
  children,
  node: _node,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
  if (href.startsWith("/")) {
    const missing = href.includes("/pages/new?");
    return (
      <Link to={href} className={missing ? "wiki-link-missing" : "wiki-link"}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

/**
 * 마크다운 렌더러 — react-markdown + remark-gfm(표) 래핑.
 * raw HTML은 렌더하지 않는다(react-markdown 기본값) — rehype-raw 추가 금지.
 * 요소 스타일은 app.css의 .markdown-body 스코프에서만 정의한다.
 */
export function MarkdownView({ markdown, pages, spaceId }: MarkdownViewProps) {
  const wikiMode = pages !== undefined && spaceId !== undefined;
  const source = wikiMode ? resolveWikiLinks(markdown, pages, spaceId) : markdown;
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={wikiMode ? { a: WikiAnchor } : undefined}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
```

`PageViewPage.tsx` — 본문 렌더 한 줄 교체:

```tsx
<MarkdownView markdown={page.body} pages={pages} spaceId={space.id} />
```

(이 지점에서 `pages === null`은 이미 상단 가드로 배제되어 있다)

`PageEditPage.tsx` — 두 가지 수정:

1. title 프리필 — `const [title, setTitle] = useState("");`를 다음으로 교체(수정 모드는 이후 effect가 덮어쓴다):

```tsx
const [title, setTitle] = useState(() => (isEdit ? "" : (searchParams.get("title") ?? "")));
```

2. outlet context에서 pages를 받아 미리보기에 전달 — `const { reloadPages } = ...`를 `const { pages, reloadPages } = useOutletContext<WikiOutletContext>();`로 바꾸고 미리보기 탭 content를:

```tsx
content: <MarkdownView markdown={body} pages={pages ?? undefined} spaceId={pages ? spaceId : undefined} />,
```

`app.css` 끝에 추가:

```css
/* W4: 페이지 간 링크 */
.markdown-body .wiki-link-missing {
  color: var(--chanho-color-text-danger);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test` 그리고 `pnpm typecheck`
Expected: 전부 PASS — 기존 `MarkdownView.test.tsx`는 pages/spaceId 없이 렌더하므로 그대로 통과

- [ ] **Step 5: 커밋**

```bash
git add src/features/wiki/components/MarkdownView.tsx src/features/wiki/pages/PageViewPage.tsx src/features/wiki/pages/PageEditPage.tsx src/app/app.css src/app/App.w4-links.test.tsx
git commit -m "feat(links): [[제목]] 렌더 — 존재 시 내부 링크, 부재 시 danger 링크→생성 프리필"
```

---

### Task 9: WikiLinkTextArea — 편집기 [[ 자동완성

**Files:**
- Create: `src/features/wiki/components/WikiLinkTextArea.tsx`
- Modify: `src/features/wiki/pages/PageEditPage.tsx` (작성 탭 TextArea 교체)
- Modify: `src/app/app.css`
- Test: `src/app/App.w4-autocomplete.test.tsx` (신규)

**Interfaces:**
- Consumes: outlet context의 `pages` (WikiOutletContext)
- Produces: `WikiLinkTextArea({ label, rows, placeholder, value, onValueChange, pages })` — 내부에서 `[[쿼리` 감지 후 드롭다운, 선택 시 `[[제목]]` 완성

- [ ] **Step 1: 실패하는 테스트 작성** — `App.w4-autocomplete.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W4 [[ 자동완성", () => {
  it("[[ 뒤 글자로 제목을 필터하고 Enter로 [[제목]]을 완성한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new");
    const body = await screen.findByLabelText("본문");
    await user.type(body, "[[개");
    const listbox = await screen.findByRole("listbox", { name: "페이지 링크 자동완성" });
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "개발 환경 설정" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(body).toHaveValue("[[개발 환경 설정]]");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("화살표로 항목을 이동하고 Escape로 닫는다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new");
    const body = await screen.findByLabelText("본문");
    await user.type(body, "[["); // 전체 목록(최대 8) 표시
    await screen.findByRole("listbox", { name: "페이지 링크 자동완성" });
    expect(screen.getByRole("option", { name: "시작하기" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "팀 규칙" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(body).toHaveValue("[[");
  });

  it("클릭으로도 선택할 수 있다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new");
    const body = await screen.findByLabelText("본문");
    await user.type(body, "메모: [[팀");
    await user.click(await screen.findByRole("option", { name: "팀 규칙" }));
    expect(body).toHaveValue("메모: [[팀 규칙]]");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/app/App.w4-autocomplete.test.tsx`
Expected: FAIL — listbox 없음

- [ ] **Step 3: 구현**

`WikiLinkTextArea.tsx` 신규:

```tsx
import { useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { TextArea } from "@chanho/react";
import type { Page } from "../store/types";

export interface WikiLinkTextAreaProps {
  label: string;
  rows: number;
  placeholder?: string;
  value: string;
  onValueChange: (next: string) => void;
  /** 자동완성 후보 — 같은 스페이스의 페이지 목록 */
  pages: Page[];
}

const MAX_SUGGESTIONS = 8;

interface ActiveQuery {
  /** 값 문자열에서 "[[" 가 시작하는 인덱스 */
  start: number;
  query: string;
  /** 감지 시점의 커서 위치 — 삽입 시 교체 구간의 끝 */
  caret: number;
}

/** 커서 앞 텍스트에서 아직 닫히지 않은 [[쿼리 를 찾는다 — 없으면 null */
function activeLinkQuery(text: string, caret: number): ActiveQuery | null {
  const before = text.slice(0, caret);
  const match = /\[\[([^\]\n]*)$/.exec(before);
  if (!match) return null;
  return { start: match.index, query: match[1], caret };
}

/**
 * [[ 자동완성 지원 TextArea.
 * 키 입력은 wrapper의 onKeyDown(버블)에서 처리한다 — 디자인 시스템 TextArea가
 * onKeyDown을 전달하는지에 의존하지 않기 위해서다(버블 단계 preventDefault도 기본동작을 막는다).
 */
export function WikiLinkTextArea({
  label,
  rows,
  placeholder,
  value,
  onValueChange,
  pages,
}: WikiLinkTextAreaProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<ActiveQuery | null>(null);
  const [highlight, setHighlight] = useState(0);

  const suggestions =
    active === null
      ? []
      : pages
          .filter((p) => p.title.toLowerCase().includes(active.query.trim().toLowerCase()))
          .slice(0, MAX_SUGGESTIONS);
  const open = active !== null && suggestions.length > 0;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange(event.target.value);
    setActive(activeLinkQuery(event.target.value, event.target.selectionStart));
    setHighlight(0);
  };

  const insert = (page: Page) => {
    if (!active) return;
    const next = value.slice(0, active.start) + `[[${page.title}]]` + value.slice(active.caret);
    onValueChange(next);
    setActive(null);
    // 커서를 닫는 ]] 뒤로 — 리렌더 후 적용
    const position = active.start + page.title.length + 4;
    requestAnimationFrame(() => {
      const textarea = wrapperRef.current?.querySelector("textarea");
      textarea?.focus();
      textarea?.setSelectionRange(position, position);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      insert(suggestions[highlight]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setActive(null);
    }
  };

  return (
    <div ref={wrapperRef} className="wiki-autocomplete" onKeyDown={handleKeyDown}>
      <TextArea
        label={label}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
      />
      {open ? (
        <ul className="wiki-autocomplete-list" role="listbox" aria-label="페이지 링크 자동완성">
          {suggestions.map((page, index) => (
            <li key={page.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                className="wiki-autocomplete-item"
                // mousedown에서 preventDefault — textarea 포커스를 유지한 채 삽입
                onMouseDown={(event) => {
                  event.preventDefault();
                  insert(page);
                }}
              >
                {page.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

`PageEditPage.tsx` — import 추가(`WikiLinkTextArea`) 후 작성 탭 content의 TextArea를 교체:

```tsx
content: (
  <WikiLinkTextArea
    label="본문"
    rows={16}
    value={body}
    onValueChange={setBody}
    placeholder="마크다운으로 작성하세요"
    pages={pages ?? []}
  />
),
```

(`pages`는 Task 8에서 이미 outlet context로 받고 있다. `TextArea` import가 더 이상 안 쓰이면 제거)

`app.css` 끝에 추가:

```css
/* W4: [[ 자동완성 */
.wiki-autocomplete {
  position: relative;
}

.wiki-autocomplete-list {
  position: absolute;
  z-index: 10;
  left: 0;
  right: 0;
  margin: 0;
  padding: var(--chanho-space-50, 4px) 0;
  list-style: none;
  background: var(--chanho-color-background-surface);
  border: 1px solid var(--chanho-color-border-default);
  border-radius: var(--chanho-radius-medium);
}

.wiki-autocomplete-item {
  display: block;
  width: 100%;
  padding: var(--chanho-space-100) var(--chanho-space-200);
  border: 0;
  background: none;
  text-align: left;
  color: var(--chanho-color-text-default);
  cursor: pointer;
}

.wiki-autocomplete-item:hover,
.wiki-autocomplete-item[aria-selected="true"] {
  background: var(--chanho-color-background-neutral-hovered);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test` 그리고 `pnpm typecheck`
Expected: 전부 PASS — 기존 편집 테스트(`App.w2-edit.test.tsx`)는 label "본문"이 유지되므로 그대로 통과해야 한다

- [ ] **Step 5: 커밋**

```bash
git add src/features/wiki/components/WikiLinkTextArea.tsx src/features/wiki/pages/PageEditPage.tsx src/app/app.css src/app/App.w4-autocomplete.test.tsx
git commit -m "feat(editor): [[ 페이지 링크 자동완성 — 필터/키보드/클릭 선택"
```

---

### Task 10: @dnd-kit 설치 + projectDrop 투영 유틸

**Files:**
- Modify: `package.json` (pnpm add)
- Create: `src/features/wiki/components/pageTreeDnd.ts`
- Test: `src/features/wiki/components/pageTreeDnd.test.ts` (신규)

**Interfaces:**
- Produces: `interface FlatDropNode { id: string; parentId: string | null; depth: number }`, `projectDrop(nodes: FlatDropNode[], activeId: string, overId: string, offsetX: number, indent: number): { parentId: string | null; beforeId: string | null } | null` — Task 11이 사용. `nodes`는 드래그 중 화면에 보이는 순서(active의 자손 제외, active 포함), `offsetX`는 드래그 시작 대비 수평 이동(px), 반환값은 movePage의 target과 동일 형태

- [ ] **Step 1: 의존성 설치**

Run: `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
Expected: package.json dependencies에 3개 추가, 설치 성공

- [ ] **Step 2: 실패하는 테스트 작성** — `pageTreeDnd.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { projectDrop, type FlatDropNode } from "./pageTreeDnd";

// 시드 트리의 평탄화: pg1(루트) > pg3 > pg5, pg1 > pg4, pg2(루트)
const NODES: FlatDropNode[] = [
  { id: "pg1", parentId: null, depth: 0 },
  { id: "pg3", parentId: "pg1", depth: 1 },
  { id: "pg5", parentId: "pg3", depth: 2 },
  { id: "pg4", parentId: "pg1", depth: 1 },
  { id: "pg2", parentId: null, depth: 0 },
];
const INDENT = 24;

describe("projectDrop", () => {
  it("루트 맨 앞으로 끌면 첫 루트 앞에 삽입한다", () => {
    expect(projectDrop(NODES, "pg2", "pg1", 0, INDENT)).toEqual({
      parentId: null,
      beforeId: "pg1",
    });
  });

  it("제자리에서 오른쪽으로 한 칸 들여쓰면 앞 항목의 부모를 따라간다", () => {
    // pg2(depth 0)를 +24px → depth 1 → 앞 항목 pg4(depth 1)와 형제 = pg1의 자식 맨 뒤
    expect(projectDrop(NODES, "pg2", "pg2", INDENT, INDENT)).toEqual({
      parentId: "pg1",
      beforeId: null,
    });
  });

  it("왼쪽으로 빼도 다음 항목의 깊이 아래로는 내려가지 않는다", () => {
    // pg5(depth 2)를 -48px → 목표 0이지만 다음 항목 pg4(depth 1)가 하한 → depth 1
    expect(projectDrop(NODES, "pg5", "pg5", -2 * INDENT, INDENT)).toEqual({
      parentId: "pg1",
      beforeId: "pg4",
    });
  });

  it("자손이 제외된 목록에서 부모를 맨 아래로 내리면 루트 맨 뒤가 된다", () => {
    // pg1 드래그 중에는 자손(pg3/pg5/pg4)이 목록에서 빠진다
    const during: FlatDropNode[] = [
      { id: "pg1", parentId: null, depth: 0 },
      { id: "pg2", parentId: null, depth: 0 },
    ];
    expect(projectDrop(during, "pg1", "pg2", 0, INDENT)).toEqual({
      parentId: null,
      beforeId: null,
    });
  });

  it("모르는 id면 null을 반환한다", () => {
    expect(projectDrop(NODES, "없는id", "pg1", 0, INDENT)).toBeNull();
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm test src/features/wiki/components/pageTreeDnd.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 구현** — `pageTreeDnd.ts`:

```ts
export interface FlatDropNode {
  id: string;
  parentId: string | null;
  depth: number;
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * 드롭 위치 투영 — dnd-kit tree 예제의 getProjection 단순화판.
 * 수평 오프셋을 들여쓰기 깊이로 환산하고, 앞뒤 항목의 깊이로 클램프한 뒤
 * movePage에 넘길 { parentId, beforeId }를 계산한다.
 */
export function projectDrop(
  nodes: FlatDropNode[],
  activeId: string,
  overId: string,
  offsetX: number,
  indent: number,
): { parentId: string | null; beforeId: string | null } | null {
  const activeIndex = nodes.findIndex((n) => n.id === activeId);
  const overIndex = nodes.findIndex((n) => n.id === overId);
  if (activeIndex === -1 || overIndex === -1) return null;
  const active = nodes[activeIndex];
  const sorted = arrayMove(nodes, activeIndex, overIndex); // active가 overIndex에 위치
  const previous: FlatDropNode | undefined = sorted[overIndex - 1];
  const next: FlatDropNode | undefined = sorted[overIndex + 1];

  const projected = active.depth + Math.round(offsetX / indent);
  const maxDepth = previous ? previous.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.min(Math.max(projected, minDepth), maxDepth);

  // 새 부모: 바로 앞 항목 기준 — 같은 깊이면 형제(부모 공유), 한 단계 얕으면 그 항목이 부모
  let parentId: string | null = null;
  if (depth > 0 && previous) {
    if (previous.depth === depth) {
      parentId = previous.parentId;
    } else if (previous.depth === depth - 1) {
      parentId = previous.id;
    } else {
      // previous가 더 깊다 — 위로 스캔해 같은 깊이의 형제를 찾는다
      for (let i = overIndex - 1; i >= 0; i--) {
        const node = sorted[i];
        if (node.depth === depth) {
          parentId = node.parentId;
          break;
        }
        if (node.depth === depth - 1) {
          parentId = node.id;
          break;
        }
      }
    }
  }

  // beforeId: 삽입 위치 뒤에서 같은 부모를 가진 첫 항목
  let beforeId: string | null = null;
  for (let i = overIndex + 1; i < sorted.length; i++) {
    const node = sorted[i];
    if (node.depth < depth) break; // 부모 범위를 벗어났다
    if (node.depth === depth && node.parentId === parentId) {
      beforeId = node.id;
      break;
    }
  }

  return { parentId, beforeId };
}
```

주의: `beforeId` 스캔의 `node.parentId === parentId` 비교는 active 자신이 아닌 항목만 대상이다(sorted에서 active는 overIndex에 있고 스캔은 그 뒤부터). 첫 번째 테스트("루트 맨 앞")처럼 뒤 항목의 parentId가 이동 전 값이어도 depth가 같으면 같은 형제 집합이다 — depth 일치가 1차 기준, parentId 비교는 (깊이만 같고 다른 서브트리인) 오매칭 방어다.

- [ ] **Step 5: 통과 확인**

Run: `pnpm test src/features/wiki/components/pageTreeDnd.test.ts`
Expected: 5개 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add package.json pnpm-lock.yaml src/features/wiki/components/pageTreeDnd.ts src/features/wiki/components/pageTreeDnd.test.ts
git commit -m "feat(tree): @dnd-kit 도입 + projectDrop 드롭 투영 유틸"
```

---

### Task 11: PageTree 드래그 정렬 연결

**Files:**
- Modify: `src/features/wiki/components/PageTree.tsx`
- Modify: `src/features/wiki/components/WikiLayout.tsx` (onMoved 전달)
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: Task 2의 `movePage`, Task 10의 `projectDrop`/`FlatDropNode`
- Produces: `PageTreeProps.onMoved?: () => void | Promise<void>` — 주어지고 `forceExpand`가 아닐 때만 드래그 활성

- [ ] **Step 1: PageTree 개편** — `PageTree.tsx`에서 import·props·컴포넌트 본문을 다음과 같이 수정 (ChevronIcon/PlusIcon/buildTree/TreeNode는 그대로 둔다):

import 추가:

```tsx
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useToast } from "@chanho/react";
import type { ReactNode } from "react";
import { movePage } from "../store/wikiStore";
import { projectDrop, type FlatDropNode } from "./pageTreeDnd";
```

props 확장:

```tsx
export interface PageTreeProps {
  spaceId: string;
  pages: Page[];
  /** true면 접힘 상태를 무시하고 전부 펼친다(검색 중) — 접기 토글도 숨긴다 */
  forceExpand?: boolean;
  /** 드래그로 페이지를 이동한 뒤 호출 — 주어지지 않으면 드래그 비활성 */
  onMoved?: () => void | Promise<void>;
}
```

buildTree 아래에 추가:

```tsx
/** 한 깊이당 들여쓰기 픽셀 — projectDrop의 offsetX 환산 기준 */
const INDENT_PX = 24;

interface FlatNode {
  page: Page;
  depth: number;
}

/** 화면에 보이는 순서대로 평탄화 — activeId의 자손은 제외(드래그 중 함께 이동하므로) */
function flattenVisible(
  roots: TreeNode[],
  collapsed: Set<string>,
  forceExpand: boolean,
  activeId: string | null,
): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ page: node.page, depth });
      const hideChildren =
        node.page.id === activeId || (!forceExpand && collapsed.has(node.page.id));
      if (!hideChildren) walk(node.children, depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}

/**
 * 드래그 가능한 트리 항목(li). useSortable의 attributes는 li에 role="button"을 붙여
 * 링크/트리 시맨틱을 해치므로 listeners만 스프레드한다(포인터 드래그 전용 — 스펙 4.1).
 */
function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "page-tree-dragging" : undefined}
      {...listeners}
    >
      {children}
    </li>
  );
}
```

컴포넌트 본문 교체:

```tsx
export function PageTree({ spaceId, pages, forceExpand = false, onMoved }: PageTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const roots = buildTree(pages);
  // 검색 필터 중에는 부분 트리라 위치 계산이 모호하므로 드래그를 끈다 (스펙 4.1)
  const dragEnabled = !forceExpand && onMoved !== undefined;
  const flat = flattenVisible(roots, collapsed, forceExpand, activeId);
  // 클릭(네비게이션)과 드래그 구분 — 6px 이상 움직여야 드래그 시작
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveId(null);
    if (!over) return;
    const dropNodes: FlatDropNode[] = flat.map((f) => ({
      id: f.page.id,
      parentId: f.page.parentId,
      depth: f.depth,
    }));
    const drop = projectDrop(dropNodes, String(active.id), String(over.id), delta.x, INDENT_PX);
    if (!drop) return;
    try {
      await movePage(String(active.id), drop);
      await onMoved?.();
    } catch (error) {
      toast({
        title: "페이지 이동 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const renderNodes = (nodes: TreeNode[]) => (
    <ul className="page-tree-list">
      {nodes.map(({ page, children }) => {
        const isCollapsed = !forceExpand && collapsed.has(page.id);
        const row = (
          <>
            <div className="page-tree-row">
              {children.length > 0 && !forceExpand ? (
                <button
                  type="button"
                  className="page-tree-toggle"
                  aria-expanded={!isCollapsed}
                  aria-label={
                    isCollapsed ? `${page.title} 하위 펼치기` : `${page.title} 하위 접기`
                  }
                  onClick={() => toggle(page.id)}
                >
                  <ChevronIcon />
                </button>
              ) : (
                <span className="page-tree-toggle-spacer" aria-hidden="true" />
              )}
              <NavLink to={`/spaces/${spaceId}/pages/${page.id}`}>{page.title}</NavLink>
              {/* NavLink의 형제 — 링크 안에 버튼 중첩 금지 */}
              <button
                type="button"
                className="page-tree-add"
                aria-label={`${page.title} 하위 페이지 추가`}
                onClick={() => navigate(`/spaces/${spaceId}/pages/new?parent=${page.id}`)}
              >
                <PlusIcon />
              </button>
            </div>
            {children.length > 0 && !isCollapsed ? renderNodes(children) : null}
          </>
        );
        return dragEnabled ? (
          <SortableRow key={page.id} id={page.id}>
            {row}
          </SortableRow>
        ) : (
          <li key={page.id}>{row}</li>
        );
      })}
    </ul>
  );

  if (roots.length === 0) {
    return <p className="page-tree-empty">페이지 없음</p>;
  }
  return (
    <nav className="page-tree" aria-label="페이지 트리">
      {dragEnabled ? (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext
            items={flat.map((f) => f.page.id)}
            strategy={verticalListSortingStrategy}
          >
            {renderNodes(roots)}
          </SortableContext>
        </DndContext>
      ) : (
        renderNodes(roots)
      )}
    </nav>
  );
}
```

`WikiLayout.tsx` — PageTree 호출부에 onMoved 전달:

```tsx
<PageTree
  spaceId={current.id}
  pages={visiblePages}
  forceExpand={searching}
  onMoved={reloadPages}
/>
```

`app.css` 끝에 추가:

```css
/* W4: 트리 드래그 */
.page-tree-dragging {
  opacity: 0.5;
}
```

- [ ] **Step 2: 기존 테스트로 회귀 확인** (트리 DnD 자체는 jsdom에서 시뮬레이션하지 않는다 — projectDrop 단위 테스트 + Task 12 수동 확인으로 커버, 스펙 5)

Run: `pnpm test` 그리고 `pnpm typecheck`
Expected: 전부 PASS — 트리 렌더/네비게이션 기존 테스트(App.test.tsx 등)가 DndContext 래핑 후에도 통과해야 한다. NavLink role/이름은 변하지 않는다

- [ ] **Step 3: 커밋**

```bash
git add src/features/wiki/components/PageTree.tsx src/features/wiki/components/WikiLayout.tsx src/app/app.css
git commit -m "feat(tree): 사이드바 드래그 정렬/이동 — dnd-kit + projectDrop, 실패 시 Toast"
```

---

### Task 12: 최종 게이트 + 수동 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 게이트**

Run: `pnpm typecheck` → `pnpm test` → `pnpm build`
Expected: 3개 전부 성공

- [ ] **Step 2: 수동 스모크** — `pnpm dev` 후 브라우저에서:

1. 트리에서 "배포 가이드"를 드래그해 "팀 규칙" 아래로 이동 → 순서/부모 반영, 새로고침 후 유지
2. "시작하기"를 자기 하위 페이지로 끌어보기 → danger Toast("페이지를 자신의 하위로 이동할 수 없습니다")
3. 페이지 편집에서 `[[팀` 입력 → 자동완성 → Enter → 저장 → 보기에서 링크 클릭 이동
4. `[[없는문서]]` 저장 → 빨간 링크 → 클릭 → 제목 프리필된 생성 화면
5. 코멘트 답글 작성/본인 코멘트 수정("(수정됨)" 확인)/삭제(confirm)
6. 히스토리 → 변경사항 탭에서 +/- 라인 하이라이트, 다크 모드 토글 후에도 가독성 확인

- [ ] **Step 3: 이상 없으면 완료 보고** (발견된 문제는 수정 후 해당 태스크 테스트에 회귀 케이스 추가)

---

## Self-Review 결과 (계획 작성 시 수행)

- 스펙 커버리지: §2 도메인(Task 1), §3 스토어(Task 1·2·3)+diff 유틸(Task 4), §4.1 트리 DnD(Task 10·11), §4.2 링크+자동완성(Task 7·8·9), §4.3 코멘트(Task 5), §4.4 diff 탭(Task 6), §5 테스트 전략(각 태스크), §6 순서 준수 ✓
- 타입 일관성: `movePage`/`addComment`/`updateComment`/`deleteComment`/`lineDiff`/`resolveWikiLinks`/`projectDrop` 시그니처가 정의 태스크와 사용 태스크에서 동일 ✓
- 알려진 리스크(실행 중 확인): ① DS `TextArea`가 표준 textarea 어트리뷰트를 전달하지 않으면 자동완성 wrapper 방식으로 흡수됨(Task 9에 반영) ② DS `Tabs`의 role 관례가 다르면 Task 6 테스트의 `getByRole("tab")`을 실제 롤에 맞춰 조정 ③ dnd-kit 렌더가 기존 트리 테스트와 충돌하면 SortableRow의 listeners 스프레드 범위를 조정
