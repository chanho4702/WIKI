# wiki-backend 연결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프론트 `wikiStore`를 시그니처 변경 없이 wiki-backend(스페이스/페이지/버전/첨부)에 연결하되, 목업을 기본으로 유지하는 듀얼모드로 마이그레이션 리스크를 격리한다.

**Architecture:** `wikiStore.ts`를 얇은 **듀얼모드 진입점**으로 바꾼다 — `VITE_API_BASE`가 있으면 백엔드 어댑터(`wikiApi.ts`), 없으면 기존 목업(`wikiMock.ts`). 어댑터는 공유 `apiFetch`(JWT+refresh)로 REST를 치고 순수 매퍼(`mapping.ts`)로 경계(Long↔string, content↔body, 에러→한국어, 낙관적 락)를 변환한다. 백엔드에 없는 것(댓글·사용자이름)은 어댑터가 목업/폴백으로 위임한다.

**Tech Stack:** React 19 · Vite 7 · TypeScript · Vitest(jsdom) · 기존 `src/auth/client.ts`(apiFetch) · wiki-backend `/api/wiki/*`(Spring Boot, JWT).

설계 근거: `docs/superpowers/specs/2026-07-21-backend-integration-design.md`. 스토어 계약: `src/features/wiki/store/CLAUDE.md`.

## Global Constraints

- **wikiStore 공개 함수 시그니처·의미론 불변**(store/CLAUDE.md). 화면 코드 무수정, 기존 **420 테스트 green 유지**(목업 모드가 기본).
- **목업 모드(=VITE_API_BASE 미설정)가 테스트/CI 기본** — 어떤 태스크도 CI에서 실 네트워크를 요구하지 않는다. 백엔드 호출은 전부 `vi.fn()`/`vi.stubGlobal("fetch", ...)`로 모킹.
- **반환값 깊은 복사**(mock 유지), **에러는 한국어 사용자 문구로 throw**.
- 하드코딩 색/인라인 스타일 금지(코드 변경엔 무관하나 규약 유지). 주석·에러는 한국어.
- id는 프론트에서 **string 유지** — 백엔드 Long은 경계에서만 변환.
- 명령: `pnpm typecheck`, `pnpm test`(전체), `pnpm test <path>`(단일). 패키지매니저 **pnpm**.
- 커밋은 각 태스크 끝에서. 브랜치는 main이면 먼저 분기.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/features/wiki/store/wikiMock.ts` (신규=기존 impl 이동) | 기존 localStorage 목업 전체(현 wikiStore.ts 내용). `__resetForTest` 포함. |
| `src/features/wiki/store/mapping.ts` (신규) | 순수 경계 매퍼: `toBackendId`/`toClientId`, `mapSpace`/`mapPage`/`mapPageTree`/`mapVersion`, `extractError`. |
| `src/features/wiki/store/apiClient.ts` (신규) | 공유 auth 클라이언트 싱글톤 노출(`sharedApiFetch`) — AuthGate와 동일 인스턴스 재사용. |
| `src/features/wiki/store/wikiApi.ts` (신규) | 백엔드 어댑터: wikiStore와 동일 함수 세트. spaces/pages/versions/attachments는 REST, comments/users는 mock/폴백 위임. |
| `src/features/wiki/store/wikiStore.ts` (수정) | 듀얼모드 진입점: `VITE_API_BASE` 유무로 api/mock 선택 후 동일 이름 재노출. |
| `src/features/wiki/store/types.ts` (수정) | `Page.version` 추가, `Space.description?` 추가. |
| `src/auth/AuthGate.tsx` (수정) | 공유 클라이언트 사용 + 백엔드 모드에서 dev `enabled`. |
| `.env.example` (신규) | `VITE_API_BASE` 문서화. |

---

## Task 1: 듀얼모드 기반 (목업 이동 + 진입점 + 공유 apiFetch)

목업을 `wikiMock.ts`로 옮기고 `wikiStore.ts`를 진입점으로 바꾼다. 이 태스크만으로 동작·테스트가 **기존과 동일**해야 한다(순수 리팩터).

**Files:**
- Create: `src/features/wiki/store/wikiMock.ts` (기존 `wikiStore.ts` 내용 그대로 이동)
- Create: `src/features/wiki/store/apiClient.ts`
- Modify: `src/features/wiki/store/wikiStore.ts` (진입점으로 축소)
- Modify: `src/auth/AuthGate.tsx` (defaultClient를 apiClient 싱글톤에서 가져오기)

**Interfaces:**
- Produces: `wikiMock.*`(기존 전 함수 + `__resetForTest`), `sharedAuthClient`/`sharedApiFetch(path, init)`, `wikiStore.*`(동일 이름 재노출), `USE_BACKEND: boolean`.

- [ ] **Step 1: 목업 파일로 이동** — 현재 `wikiStore.ts` 전체 내용을 `wikiMock.ts`로 복사(파일 상단 주석에 "듀얼모드 목업 백엔드" 명시). 내용 변경 없음.

- [ ] **Step 2: 공유 auth 클라이언트 추출**

```ts
// src/features/wiki/store/apiClient.ts
// AuthGate와 스토어가 같은 auth 클라이언트(메모리 AT·refresh dedup)를 공유하도록 싱글톤으로 노출한다.
import { createAuthClient } from "../../../auth/client";

/** 백엔드 모드일 때만 의미 있음. baseUrl = 게이트웨이(VITE_API_BASE). */
export const sharedAuthClient = createAuthClient({
  baseUrl: (import.meta.env.VITE_API_BASE as string) ?? "",
});

/** 백엔드 모드 여부 — VITE_API_BASE가 설정되면 실제 백엔드. */
export const USE_BACKEND = Boolean(import.meta.env.VITE_API_BASE);

export const sharedApiFetch = sharedAuthClient.apiFetch;
```

- [ ] **Step 3: AuthGate가 공유 클라이언트를 쓰도록 수정**

`src/auth/AuthGate.tsx`의 `const defaultClient = createAuthClient({...})` 줄을 삭제하고 상단 import에 `import { sharedAuthClient } from "../features/wiki/store/apiClient";` 추가, `client = defaultClient` 기본값을 `client = sharedAuthClient`로 교체. `enabled` 기본값은 다음 줄로 교체(백엔드 모드에선 dev도 게이트 on):

```tsx
enabled = import.meta.env.PROD || Boolean(import.meta.env.VITE_API_BASE),
```

- [ ] **Step 4: wikiStore를 진입점으로 축소**

```ts
// src/features/wiki/store/wikiStore.ts
// 듀얼모드 진입점 — VITE_API_BASE가 있으면 백엔드 어댑터(wikiApi), 없으면 목업(wikiMock).
// 공개 함수 시그니처·의미론은 store/CLAUDE.md 계약 그대로. 화면·테스트는 이 모듈만 import한다.
import * as mock from "./wikiMock";
import * as api from "./wikiApi";
import { USE_BACKEND } from "./apiClient";

const impl = USE_BACKEND ? api : mock;

export const listUsers = impl.listUsers;
export const getCurrentUser = impl.getCurrentUser;
export const listSpaces = impl.listSpaces;
export const createSpace = impl.createSpace;
export const listPages = impl.listPages;
export const getPage = impl.getPage;
export const createPage = impl.createPage;
export const updatePage = impl.updatePage;
export const deletePage = impl.deletePage;
export const movePage = impl.movePage;
export const listVersions = impl.listVersions;
export const restoreVersion = impl.restoreVersion;
export const listComments = impl.listComments;
export const addComment = impl.addComment;
export const updateComment = impl.updateComment;
export const deleteComment = impl.deleteComment;

// 테스트 전용 — 항상 목업 캐시를 초기화(백엔드 모드에선 테스트를 돌리지 않음).
export const __resetForTest = mock.__resetForTest;
```

- [ ] **Step 5: wikiApi 스텁 생성(임시 재노출)** — 다음 태스크들이 채운다. 지금은 mock 재노출로 typecheck를 통과시킨다.

```ts
// src/features/wiki/store/wikiApi.ts
// wiki-backend 어댑터. 각 태스크에서 REST 구현으로 교체한다. 미구현분은 목업 위임.
export {
  listUsers, getCurrentUser, listSpaces, createSpace, listPages, getPage,
  createPage, updatePage, deletePage, movePage, listVersions, restoreVersion,
  listComments, addComment, updateComment, deleteComment, __resetForTest,
} from "./wikiMock";
```

- [ ] **Step 6: 전체 검증 (순수 리팩터 회귀 없음)**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck PASS, **420 tests PASS** (동작 불변).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor(store): 듀얼모드 진입점 도입 — 목업을 wikiMock로 분리, 공유 auth 클라이언트"
```

---

## Task 2: 경계 매퍼 (mapping.ts)

순수 함수만 — 백엔드 DTO ↔ 프론트 타입 변환. 단위 테스트로 고정.

**Files:**
- Create: `src/features/wiki/store/mapping.ts`
- Test: `src/features/wiki/store/mapping.test.ts`
- Modify: `src/features/wiki/store/types.ts` (`Page.version`, `Space.description?`)

**Interfaces:**
- Produces: `toClientId(n:number):string`, `toBackendId(s:string):number`, `mapSpace(dto):Space`, `mapPage(dto):Page`, `mapPageTree(items):Page[]`, `mapVersionMeta(dto,pageId):PageVersion`, `mapVersionFull(dto,pageId):PageVersion`, `extractError(status:number, body:unknown):string`.

- [ ] **Step 1: 타입 확장**

`types.ts`의 `Space`에 `description?: string;` 추가, `Page`에 `version: number; // 낙관적 락 카운터(백엔드 연동). 목업은 항상 1.` 추가. `wikiMock.ts`의 `createPage`/`updatePage`가 만드는 Page 리터럴에 `version: 1`(생성) 및 갱신 없음 — 목업은 version 무의미하므로 생성 시 `version: 1` 고정, updatePage에서 `page.version` 유지. (목업 테스트가 version을 검사하지 않으므로 무해.)

- [ ] **Step 2: 실패 테스트 작성**

```ts
// src/features/wiki/store/mapping.test.ts
import { describe, expect, it } from "vitest";
import { toClientId, toBackendId, mapSpace, mapPage, mapPageTree, extractError } from "./mapping";

describe("id 변환", () => {
  it("Long↔string 왕복", () => {
    expect(toClientId(42)).toBe("42");
    expect(toBackendId("42")).toBe(42);
  });
  it("숫자가 아닌 id는 거부", () => {
    expect(() => toBackendId("abc")).toThrow();
  });
});

describe("mapPage", () => {
  it("content→body, id/spaceId/parentId를 string으로, version 유지", () => {
    const p = mapPage({ id: 1, spaceId: 2, parentId: null, title: "T", content: "본문", version: 3 });
    expect(p).toMatchObject({ id: "1", spaceId: "2", parentId: null, title: "T", body: "본문", version: 3 });
  });
});

describe("mapPageTree", () => {
  it("flat 트리 항목을 position 없이 순서대로 매핑(index+1을 position으로)", () => {
    const rows = [{ id: 1, parentId: null, title: "A" }, { id: 2, parentId: 1, title: "B" }];
    const pages = mapPageTree(rows);
    expect(pages[0]).toMatchObject({ id: "1", parentId: null, title: "A", position: 1 });
    expect(pages[1]).toMatchObject({ id: "2", parentId: "1", title: "B", position: 2 });
  });
});

describe("extractError", () => {
  it("body.error 문구를 우선 사용", () => {
    expect(extractError(404, { error: "페이지를 찾을 수 없습니다" })).toBe("페이지를 찾을 수 없습니다");
  });
  it("409는 충돌 안내로 폴백", () => {
    expect(extractError(409, {})).toContain("다른 사용자");
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `pnpm test src/features/wiki/store/mapping.test.ts` — Expected: FAIL(모듈 없음).

- [ ] **Step 4: 구현**

```ts
// src/features/wiki/store/mapping.ts
// 백엔드(wiki-backend) DTO ↔ 프론트 도메인 타입 순수 변환. 부수효과 없음.
import type { Page, PageVersion, Space } from "./types";

export function toClientId(n: number): string {
  return String(n);
}
export function toBackendId(s: string): number {
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error(`잘못된 백엔드 id: ${s}`);
  return n;
}

interface SpaceDto { id: number; key: string; name: string; description?: string | null }
export function mapSpace(dto: SpaceDto): Space {
  return {
    id: toClientId(dto.id),
    key: dto.key,
    name: dto.name,
    description: dto.description ?? undefined,
    // 백엔드 SpaceResponse엔 createdAt이 없다 — 목록/카드의 생성일은 빈 값 처리(디렉토리는 "-" 표기).
    createdAt: "",
  };
}

interface PageDto { id: number; spaceId: number; parentId: number | null; title: string; content: string; version: number }
export function mapPage(dto: PageDto): Page {
  const now = ""; // 백엔드 PageResponse엔 시각/작성자 없음 — 상세는 별도(§ 사용자/시각 폴백)
  return {
    id: toClientId(dto.id),
    spaceId: toClientId(dto.spaceId),
    parentId: dto.parentId === null ? null : toClientId(dto.parentId),
    title: dto.title,
    body: dto.content,
    version: dto.version,
    position: 0,
    createdBy: "", updatedBy: "", createdAt: now, updatedAt: now,
  };
}

interface TreeItemDto { id: number; parentId: number | null; title: string }
export function mapPageTree(items: TreeItemDto[]): Page[] {
  // 백엔드 트리엔 position/본문/시각이 없다. index+1을 position으로 부여(형제 순서는 서버 미보장 — 설계 §4-3).
  return items.map((it, i) => ({
    id: toClientId(it.id),
    spaceId: "",
    parentId: it.parentId === null ? null : toClientId(it.parentId),
    title: it.title,
    body: "",
    version: 1,
    position: i + 1,
    createdBy: "", updatedBy: "", createdAt: "", updatedAt: "",
  }));
}

interface RevMetaDto { version: number; editedBy: number; createdAt: string }
export function mapVersionMeta(dto: RevMetaDto, pageId: string): PageVersion {
  return {
    id: `${pageId}:${dto.version}`, pageId, version: dto.version,
    title: "", body: "",
    savedBy: toClientId(dto.editedBy), savedAt: dto.createdAt,
  };
}
interface RevFullDto { version: number; title: string; content: string; editedBy: number }
export function mapVersionFull(dto: RevFullDto, pageId: string, savedAt = ""): PageVersion {
  return {
    id: `${pageId}:${dto.version}`, pageId, version: dto.version,
    title: dto.title, body: dto.content,
    savedBy: toClientId(dto.editedBy), savedAt,
  };
}

export function extractError(status: number, body: unknown): string {
  const msg = (body as { error?: string } | null)?.error;
  if (typeof msg === "string" && msg) return msg;
  if (status === 409) return "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.";
  if (status === 403) return "권한이 없습니다.";
  if (status === 404) return "찾을 수 없습니다.";
  return `요청 실패(${status})`;
}
```

- [ ] **Step 5: 통과 확인** — Run: `pnpm test src/features/wiki/store/mapping.test.ts` — Expected: PASS.

- [ ] **Step 6: typecheck** — Run: `pnpm typecheck` — Expected: PASS(목업 Page 리터럴 version 포함 확인).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(store): 경계 매퍼(mapping.ts) + Page.version/Space.description"`

---

## Task 3: spaces 어댑터 (wikiApi)

**Files:**
- Modify: `src/features/wiki/store/wikiApi.ts` (spaces 함수만 REST로 교체)
- Test: `src/features/wiki/store/wikiApi.spaces.test.ts`

**Interfaces:**
- Consumes: `sharedApiFetch`(Task1), `mapSpace`/`extractError`/`toBackendId`(Task2).
- Produces: `wikiApi.listSpaces/createSpace` (백엔드 구현).

- [ ] **Step 1: 실패 테스트(fetch 모킹)**

```ts
// src/features/wiki/store/wikiApi.spaces.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

function mockApiFetch(status: number, body: unknown) {
  return vi.spyOn(client, "sharedApiFetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}
afterEach(() => vi.restoreAllMocks());

describe("wikiApi.listSpaces", () => {
  it("GET /api/wiki/spaces 결과를 Space[]로 매핑(id string, description)", async () => {
    mockApiFetch(200, [{ id: 7, key: "DEV", name: "개발", description: "d" }]);
    const { listSpaces } = await import("./wikiApi");
    const spaces = await listSpaces();
    expect(spaces[0]).toMatchObject({ id: "7", key: "DEV", name: "개발", description: "d" });
  });
});

describe("wikiApi.createSpace", () => {
  it("POST 후 매핑, 4xx는 body.error를 한국어로 throw", async () => {
    mockApiFetch(409, { error: "이미 존재하는 스페이스 키입니다" });
    const { createSpace } = await import("./wikiApi");
    await expect(createSpace({ key: "DEV", name: "개발" })).rejects.toThrow("이미 존재하는 스페이스 키입니다");
  });
});
```
> 주의: 이 테스트 파일은 `sharedApiFetch`를 spy하므로 `VITE_API_BASE` 미설정(목업 기본)이어도 wikiApi를 직접 import해 검증한다.

- [ ] **Step 2: 실패 확인** — Run: `pnpm test src/features/wiki/store/wikiApi.spaces.test.ts` — Expected: FAIL(아직 mock 재노출).

- [ ] **Step 3: 구현** — `wikiApi.ts`에서 `listSpaces`/`createSpace`를 재노출 목록에서 빼고 아래 구현 추가(나머지는 계속 mock 재노출):

```ts
import { sharedApiFetch } from "./apiClient";
import { mapSpace, extractError } from "./mapping";
import type { Space } from "./types";

async function json<T>(res: Response): Promise<T> {
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(extractError(res.status, body));
  return body as T;
}

export async function listSpaces(): Promise<Space[]> {
  const dtos = await json<Parameters<typeof mapSpace>[0][]>(await sharedApiFetch("/api/wiki/spaces"));
  return dtos.map(mapSpace);
}
export async function createSpace(input: { key: string; name: string }): Promise<Space> {
  const res = await sharedApiFetch("/api/wiki/spaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: input.key.trim().toLowerCase(), name: input.name.trim() }),
  });
  return mapSpace(await json(res));
}
```
> 백엔드 key 규칙은 `[a-z0-9-]+`(소문자) — 목업은 대문자로 저장하므로 백엔드 모드에선 소문자 전송. (화면의 대문자 표기는 별도 이슈 — 후속.)

- [ ] **Step 4: 통과 확인** — Run: `pnpm test src/features/wiki/store/wikiApi.spaces.test.ts` — Expected: PASS.
- [ ] **Step 5: 전체 회귀** — Run: `pnpm typecheck && pnpm test` — Expected: 전부 PASS(목업 모드 무영향).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(store): spaces 백엔드 어댑터"`

---

## Task 4: pages 어댑터

create/get/tree(listPages)/update(+낙관적 락)/delete/move(via PUT). **낙관적 락**: update는 최신 version이 필요 — 어댑터가 `getPage`로 version을 읽어 PUT `expectedVersion`에 넣는다(화면 무수정).

**Files:**
- Modify: `src/features/wiki/store/wikiApi.ts`
- Test: `src/features/wiki/store/wikiApi.pages.test.ts`

**Interfaces:**
- Consumes: `mapPage`/`mapPageTree`/`toBackendId`(Task2).
- Produces: `wikiApi.listPages/getPage/createPage/updatePage/deletePage/movePage`.

- [ ] **Step 1: 실패 테스트(핵심 3개)**

```ts
// src/features/wiki/store/wikiApi.pages.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";

function mockSeq(responses: Array<{ status: number; body: unknown }>) {
  const spy = vi.spyOn(client, "sharedApiFetch");
  for (const r of responses) {
    spy.mockResolvedValueOnce(new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } }));
  }
  return spy;
}
afterEach(() => vi.restoreAllMocks());

describe("wikiApi pages", () => {
  it("listPages → GET tree를 Page[]로(position=index+1)", async () => {
    mockSeq([{ status: 200, body: [{ id: 1, parentId: null, title: "A" }] }]);
    const { listPages } = await import("./wikiApi");
    const pages = await listPages("5");
    expect(pages[0]).toMatchObject({ id: "1", parentId: null, position: 1 });
  });

  it("updatePage는 getPage로 version을 읽어 PUT expectedVersion에 넣는다", async () => {
    const spy = mockSeq([
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "T", content: "old", version: 4 } }, // getPage
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "T2", content: "new", version: 5 } }, // put
    ]);
    const { updatePage } = await import("./wikiApi");
    const saved = await updatePage("1", { title: "T2", body: "new" });
    expect(saved).toMatchObject({ title: "T2", body: "new", version: 5 });
    const putInit = spy.mock.calls[1][1]!;
    expect(JSON.parse(putInit.body as string)).toMatchObject({ expectedVersion: 4 });
  });

  it("PUT 409는 충돌 한국어 에러", async () => {
    mockSeq([
      { status: 200, body: { id: 1, spaceId: 5, parentId: null, title: "T", content: "o", version: 4 } },
      { status: 409, body: { error: "" } },
    ]);
    const { updatePage } = await import("./wikiApi");
    await expect(updatePage("1", { title: "X", body: "y" })).rejects.toThrow(/다른 사용자/);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test src/features/wiki/store/wikiApi.pages.test.ts` — Expected: FAIL.

- [ ] **Step 3: 구현** (wikiApi.ts에 추가, mock 재노출 목록에서 pages 함수 제거)

```ts
import { mapPage, mapPageTree, toBackendId } from "./mapping";
import type { Page } from "./types";

export async function listPages(spaceId: string): Promise<Page[]> {
  const rows = await json<Parameters<typeof mapPageTree>[0]>(
    await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/pages`),
  );
  return mapPageTree(rows);
}
export async function getPage(id: string): Promise<Page | null> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`);
  if (res.status === 404) return null;
  return mapPage(await json(res));
}
export async function createPage(input: { spaceId: string; parentId?: string | null; title: string; body?: string }): Promise<Page> {
  const res = await sharedApiFetch("/api/wiki/pages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spaceId: toBackendId(input.spaceId),
      parentId: input.parentId ? toBackendId(input.parentId) : null,
      title: input.title.trim(), content: input.body ?? "",
    }),
  });
  return mapPage(await json(res));
}
export async function updatePage(id: string, patch: { title?: string; body?: string }): Promise<Page> {
  const current = await getPage(id);
  if (!current) throw new Error("페이지를 찾을 수 없습니다");
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: (patch.title ?? current.title).trim(),
      content: patch.body ?? current.body,
      parentId: current.parentId ? toBackendId(current.parentId) : null,
      expectedVersion: current.version,
    }),
  });
  return mapPage(await json(res));
}
export async function deletePage(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`, { method: "DELETE" }));
}
export async function movePage(id: string, target: { parentId: string | null; beforeId?: string | null }): Promise<Page> {
  // 백엔드는 순서(beforeId)를 지원하지 않는다 — parentId만 PUT으로 반영(설계 §4-3).
  const current = await getPage(id);
  if (!current) throw new Error("페이지를 찾을 수 없습니다");
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: current.title, content: current.body,
      parentId: target.parentId ? toBackendId(target.parentId) : null,
      expectedVersion: current.version,
    }),
  });
  return mapPage(await json(res));
}
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm test src/features/wiki/store/wikiApi.pages.test.ts` — Expected: PASS.
- [ ] **Step 5: 전체 회귀** — `pnpm typecheck && pnpm test` — Expected: PASS.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(store): pages 백엔드 어댑터(+낙관적 락)"`

---

## Task 5: versions 어댑터

**Files:** Modify `wikiApi.ts`; Test `src/features/wiki/store/wikiApi.versions.test.ts`.
**Interfaces:** Consumes `mapVersionMeta`/`mapVersionFull`; Produces `wikiApi.listVersions/restoreVersion`.

- [ ] **Step 1: 실패 테스트**

```ts
// src/features/wiki/store/wikiApi.versions.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
function once(status: number, body: unknown) {
  return vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}
afterEach(() => vi.restoreAllMocks());

it("listVersions → RevisionMeta[]를 PageVersion[]로(savedBy=editedBy)", async () => {
  once(200, [{ version: 2, editedBy: 9, createdAt: "2026-07-20T00:00:00Z" }]);
  const { listVersions } = await import("./wikiApi");
  const vs = await listVersions("3");
  expect(vs[0]).toMatchObject({ pageId: "3", version: 2, savedBy: "9", savedAt: "2026-07-20T00:00:00Z" });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test src/features/wiki/store/wikiApi.versions.test.ts` — Expected: FAIL.

- [ ] **Step 3: 구현**

```ts
import { mapVersionMeta, mapVersionFull } from "./mapping";
import type { Page, PageVersion } from "./types";

export async function listVersions(pageId: string): Promise<PageVersion[]> {
  const metas = await json<Parameters<typeof mapVersionMeta>[0][]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/revisions`),
  );
  return metas.map((m) => mapVersionMeta(m, pageId)); // 백엔드가 최신순 보장
}
export async function restoreVersion(pageId: string, versionId: string): Promise<Page> {
  // versionId는 어댑터가 만든 `${pageId}:${version}` — 버전 번호를 추출해 restore 엔드포인트 호출.
  const version = Number(versionId.split(":")[1]);
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/revisions/${version}/restore`, { method: "POST" });
  return mapPage(await json(res));
}
```
> 주의: 화면(HistoryModal)은 `version.id`를 restore에 넘긴다 — 어댑터의 `mapVersionMeta`가 id를 `${pageId}:${version}`으로 만들었으므로 여기서 그대로 파싱된다. `mapVersionFull`은 단일 버전 조회용(현재 화면 미사용 — 미리보기는 meta+본문 별도 조회가 필요하면 후속).

- [ ] **Step 4~6:** 통과 확인 → `pnpm typecheck && pnpm test` → Commit `feat(store): versions 백엔드 어댑터`.

---

## Task 6: users 폴백 + comments 목업 유지 확인

백엔드에 사용자/댓글 없음 → getCurrentUser는 `/api/me`, listUsers는 폴백, comments는 목업 위임(이미 Task1 재노출로 동작).

**Files:** Modify `wikiApi.ts`; Test `src/features/wiki/store/wikiApi.users.test.ts`.
**Interfaces:** Produces `wikiApi.getCurrentUser/listUsers`(폴백). comments 4함수는 `wikiMock` 재노출 유지.

- [ ] **Step 1: 실패 테스트**

```ts
// src/features/wiki/store/wikiApi.users.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
afterEach(() => vi.restoreAllMocks());

it("getCurrentUser는 /api/me의 id/name을 User로", async () => {
  vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(
    new Response(JSON.stringify({ id: 11, name: "이서연" }), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  const { getCurrentUser } = await import("./wikiApi");
  expect(await getCurrentUser()).toMatchObject({ id: "11", name: "이서연" });
});

it("listUsers는 폴백으로 빈 배열(org-service 미연동)", async () => {
  const { listUsers } = await import("./wikiApi");
  expect(await listUsers()).toEqual([]);
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test src/features/wiki/store/wikiApi.users.test.ts` — Expected: FAIL.

- [ ] **Step 3: 구현**

```ts
import type { User } from "./types";

export async function getCurrentUser(): Promise<User> {
  const me = await json<{ id: number | string; name?: string; email?: string }>(await sharedApiFetch("/api/me"));
  return { id: String(me.id), name: me.name ?? me.email ?? `사용자 #${me.id}` };
}
export async function listUsers(): Promise<User[]> {
  // 백엔드에 사용자 목록 없음 — org-service users API 연동 전까지 빈 배열(작성자 이름은 폴백 `사용자 #{id}`).
  return [];
}
/** 화면이 updatedBy/authorId(숫자 id)를 이름으로 못 찾을 때 쓰는 폴백. (호출부 후속 배선.) */
export function displayUserName(id: string): string {
  return `사용자 #${id}`;
}
```
> comments 4함수(listComments/addComment/updateComment/deleteComment)는 `wikiApi.ts` 상단 재노출에서 계속 `wikiMock`을 가리킨다 — 백엔드 모드에서도 댓글은 localStorage 목업으로 동작(설계 §4-2). 재노출 export 목록에 이 4개가 남아있는지 확인.

- [ ] **Step 4~6:** 통과 확인 → 전체 회귀 → Commit `feat(store): users 폴백 + comments 목업 유지`.

---

## Task 7: dev 백엔드 모드 구성 + 수동 스모크

**Files:** Create `.env.example`; (코드 변경 없음 — Task1에서 AuthGate dev enable 처리 완료).

- [ ] **Step 1: 환경 문서**

```bash
# .env.example
# 목업 모드(기본): 이 변수를 비우면 localStorage 목업으로 동작(테스트/오프라인).
# 백엔드 모드: 게이트웨이 URL을 넣으면 wiki-backend 연동 + dev에서도 AuthGate(keycloak 로그인) 활성.
VITE_API_BASE=http://localhost:8000
```

- [ ] **Step 2: 플랫폼 기동** — 게이트웨이 :8000, 인증서버(JWKS :9000), org-service(gRPC :9131), postgres :5433, wiki-backend :9110, eureka를 띄운다(각 서비스 README).

- [ ] **Step 3: 스모크** — `.env`에 `VITE_API_BASE` 설정 → `pnpm dev --force`(Vite optimizeDeps 갱신) → `http://localhost:5174/wiki/` → keycloak 로그인 → 스페이스 생성 → 트리 → 새 페이지 작성/저장(버전 v1) → 편집/저장(v2, 낙관적 락) → 히스토리에서 v1 복원. 콘솔 401/403/409 확인.

- [ ] **Step 4: 관찰 기록** — 스모크 결과(권한/시각 폴백 이슈 등)를 설계문서 §4/후속에 반영.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "docs(store): 백엔드 모드 .env 구성 + 스모크 절차"`

---

## Task 8: attachments 어댑터 (신규 capability)

백엔드가 첨부를 지원하므로 스토어에 첨부 함수를 추가(에디터 배선은 별도 후속). wikiStore 공개 API 확장(신규 함수 추가는 기존 시그니처 불변이라 안전).

**Files:** Modify `wikiApi.ts`, `wikiMock.ts`(no-op 스텁), `wikiStore.ts`(재노출), `types.ts`(Attachment); Test `src/features/wiki/store/wikiApi.attachments.test.ts`.

**Interfaces:** Produces `listAttachments(pageId):Promise<Attachment[]>`, `uploadAttachment(pageId, file):Promise<Attachment>`, `attachmentUrl(id):string`, `deleteAttachment(id):Promise<void>`. `Attachment = { id, pageId, filename, contentType, sizeBytes }`.

- [ ] **Step 1: 타입 추가** — `types.ts`에 `Attachment` 인터페이스 추가.
- [ ] **Step 2: 실패 테스트** — listAttachments가 GET 결과를 매핑(id string), uploadAttachment가 multipart FormData로 POST 하는지(헤더 Content-Type 미지정 확인).

```ts
// src/features/wiki/store/wikiApi.attachments.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./apiClient";
afterEach(() => vi.restoreAllMocks());
it("listAttachments 매핑", async () => {
  vi.spyOn(client, "sharedApiFetch").mockResolvedValueOnce(new Response(JSON.stringify([{ id: 3, filename: "a.png", contentType: "image/png", sizeBytes: 10 }]), { status: 200, headers: { "Content-Type": "application/json" } }));
  const { listAttachments } = await import("./wikiApi");
  expect((await listAttachments("2"))[0]).toMatchObject({ id: "3", filename: "a.png", pageId: "2" });
});
```

- [ ] **Step 3: 구현**

```ts
import type { Attachment } from "./types";
interface AttDto { id: number; filename: string; contentType: string; sizeBytes: number }
const mapAtt = (d: AttDto, pageId: string): Attachment => ({ id: String(d.id), pageId, filename: d.filename, contentType: d.contentType, sizeBytes: d.sizeBytes });

export async function listAttachments(pageId: string): Promise<Attachment[]> {
  const dtos = await json<AttDto[]>(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/attachments`));
  return dtos.map((d) => mapAtt(d, pageId));
}
export async function uploadAttachment(pageId: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/attachments`, { method: "POST", body: form });
  return mapAtt(await json(res), pageId);
}
export function attachmentUrl(id: string): string {
  return `${import.meta.env.VITE_API_BASE ?? ""}/api/wiki/attachments/${toBackendId(id)}`;
}
export async function deleteAttachment(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/wiki/attachments/${toBackendId(id)}`, { method: "DELETE" }));
}
```
- `wikiMock.ts`에 동일 시그니처 no-op(목업 모드는 첨부 미지원): `listAttachments` → `[]`, `uploadAttachment` → `throw new Error("목업 모드에서는 첨부를 지원하지 않습니다")`, `attachmentUrl` → `""`, `deleteAttachment` → resolve. `wikiStore.ts`에 4개 재노출 추가.

- [ ] **Step 4~6:** 통과 확인 → 전체 회귀 → Commit `feat(store): attachments 백엔드 어댑터(에디터 배선은 후속)`.

---

## 후속(이 계획 밖)

- org-service **users API** 연동(작성자 이름/아바타) — 현재 `사용자 #{id}` 폴백.
- 화면의 **작성자 이름 폴백 배선**(PageViewPage 메타·HistoryModal `editedBy`·CommentSection) — 백엔드 모드에서 이름 없는 id를 `displayUserName`으로.
- **첨부 에디터 UX**(드래그·붙여넣기 업로드), 백엔드 **comments/position/labels·owner** 추가.
- 백엔드 `SpaceResponse`에 **createdAt** 부재 → 디렉토리 생성일 "-" 처리(또는 백엔드 확장).

## 커버리지 자기점검 (spec §대비)

- §3 원칙(시그니처 불변·듀얼모드·apiFetch 공유) → Task1. §2 매핑(id/content/version/에러) → Task2. §4-4 낙관적 락 → Task4. §4-1 사용자 폴백 → Task6. §4-2 댓글 목업 → Task1/6. §4-3 순서 미영속 → Task4(movePage 주석). §5 dev 인증/스모크 → Task1(AuthGate)+Task7. 첨부(신규) → Task8. 모든 태스크: 목업 모드 420 green 유지.
