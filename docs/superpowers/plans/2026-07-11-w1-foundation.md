# WIKI Front W1 — 기반(스캐폴드 + wikiStore 전체 + 앱 셸) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 컨플루언스 클론(WIKI Front)의 W1 — 스캐폴드, wikiStore 13함수 전체(시드+테스트 포함), WikiLayout/페이지 트리/라우팅/스페이스 생성 흐름을 완성한다.

**Architecture:** ALM Front(지라 클론, `C:\MSA_TEMPLATE\alm-front`)에서 검증된 패턴을 그대로 미러한다 — 화면은 `wikiStore.ts`의 async 함수만 호출(백엔드 교체 지점), 스토어는 모듈 캐시+localStorage 단일 키, 반환은 항상 `structuredClone` 깊은 복사, 도메인 규칙 위반은 한국어 메시지로 throw. 버전은 스토어의 부수효과(createPage=v1, updatePage=실변경 시 새 버전)다.

**Tech Stack:** Vite 7 + React 19 + TypeScript(strict) + react-router 7(단일 패키지) + @chanho/react·@chanho/tokens(tarball) + Vitest 3/Testing Library.

## Global Constraints

- 앱 루트: `C:\MSA_TEMPLATE\wiki-front` (repo 존재, `main` 브랜치, 현재 docs만 커밋됨). **모든 명령은 이 디렉터리에서 실행한다.**
- 디자인 시스템은 tarball로 소비: `"@chanho/react": "file:../design-system/artifacts/chanho-react-0.2.0.tgz"`, `"@chanho/tokens": "file:../design-system/artifacts/chanho-tokens-0.1.0.tgz"` + pnpm 독립 워크스페이스 overrides (alm-front `pnpm-workspace.yaml` 미러).
- **UI는 100% 디자인 시스템** — MUI 등 타 UI 라이브러리 금지.
- **react-markdown은 W2에서 설치한다 — W1에서 설치 금지(YAGNI).** @dnd-kit 불필요.
- 검색 TextField(트리 필터)는 W3, "새 페이지"/하위 페이지 추가 버튼·`/edit`·`/new` 라우트는 W2 — **W1에 넣지 않는다.** W1의 트리는 조회/탐색 전용.
- localStorage 단일 키: `wiki.v1`. 손상 JSON이면 시드 재생성.
- 에러는 명확한 **한국어 메시지로 throw** — 화면은 Toast(danger)로 표시.
- 게이트(각 태스크 종료 시): `pnpm typecheck && pnpm test && pnpm build` 전부 통과.
- TDD — RED를 실제로 관찰한 뒤 구현한다.
- `main`에 직접 커밋, **한국어 커밋 메시지**. **push는 하지 않는다(컨트롤러 담당).**

---

## 파일 구조 (W1 전체)

```
wiki-front/
├── package.json                  ← Task 1 (alm-front 미러, dnd-kit 제외)
├── pnpm-workspace.yaml           ← Task 1
├── tsconfig.json                 ← Task 1
├── vite.config.ts                ← Task 1
├── vitest.config.ts              ← Task 1
├── vitest.setup.ts               ← Task 1 (Radix 폴리필 + cleanup)
├── index.html                    ← Task 1
├── .gitignore                    ← Task 1
└── src/
    ├── app/
    │   ├── main.tsx              ← Task 1 (tokens css + styles.css + ToastProvider + router)
    │   ├── App.tsx               ← Task 1 스텁 → Task 4 교체
    │   ├── App.test.tsx          ← Task 1 스모크 → Task 4 교체(RTL 핵심 흐름)
    │   └── app.css               ← Task 1 최소 → Task 4 교체(전체)
    ├── features/wiki/
    │   ├── components/
    │   │   ├── WikiLayout.tsx        ← Task 4
    │   │   ├── PageTree.tsx          ← Task 4
    │   │   ├── SpaceCreateModal.tsx  ← Task 4
    │   │   └── EmptySpaces.tsx       ← Task 4
    │   ├── pages/
    │   │   ├── SpaceIndexPage.tsx    ← Task 4 (첫 루트 페이지 redirect / 페이지 0개 안내)
    │   │   └── PageViewPage.tsx      ← Task 4 (보기 자리표시 스텁 — 본문 렌더는 W2)
    │   └── store/
    │       ├── types.ts                  ← Task 2
    │       ├── wikiStore.ts              ← Task 2 + Task 3
    │       ├── wikiStore.spaces.test.ts  ← Task 2
    │       ├── wikiStore.pages.test.ts   ← Task 2
    │       ├── wikiStore.versions.test.ts← Task 3
    │       └── wikiStore.comments.test.ts← Task 3
    └── mock/
        ├── users.ts              ← Task 2 (alm-front과 동일 4명)
        └── seed.ts               ← Task 2
```

## 시드 데이터 고정 상수 (전 태스크 공통 — 테스트 단언이 이 표에 의존한다)

| 종류 | id | 내용 |
|---|---|---|
| Space | `sp1` | key `DEV`, name `개발 위키` |
| Page | `pg1` | 루트, title `시작하기`, position 1, **마크다운 풍부 본문(제목/목록/코드블록/표)**, createdBy u1, updatedBy u2, **버전 2개** |
| Page | `pg2` | 루트, title `팀 규칙`, position 2 |
| Page | `pg3` | `pg1`의 자식, title `개발 환경 설정`, position 1 |
| Page | `pg4` | `pg1`의 자식, title `배포 가이드`, position 2 |
| Page | `pg5` | `pg3`의 자식(**깊이 3 손자**), title `로컬 DB 설정`, position 1 |
| Version | `pv1` | pg1 v1 (초기 짧은 본문, savedBy u1) |
| Version | `pv2` | pg1 v2 (현재 본문과 동일, savedBy u2) |
| Version | `pv3`~`pv6` | pg2/pg3/pg4/pg5 각 v1 |
| Comment | `c1` | pg1, authorId u2, `온보딩에 딱 필요한 내용이네요.` |
| Comment | `c2` | pg1, authorId u3, `배포 가이드 링크도 추가하면 좋겠습니다.` |
| User | `u1`~`u4` | 김찬호/이서연/박준영/최다인 (현재 유저 = `u1`, alm-front과 동일) |

고정 시각: 생성 `2026-07-10T09:00:00.000Z`, pg1 수정(v2) `2026-07-10T10:00:00.000Z`, 코멘트 `2026-07-10T11:00:00.000Z` / `2026-07-10T11:30:00.000Z`.

---

### Task 1: 스캐폴드 + 스모크 테스트

alm-front의 실검증된 설정 파일을 이름만 wiki-front로 바꿔 미러한다. dnd-kit는 넣지 않는다. react-markdown도 넣지 않는다(W2).

**Files:**
- Create: `C:\MSA_TEMPLATE\wiki-front\package.json`
- Create: `C:\MSA_TEMPLATE\wiki-front\pnpm-workspace.yaml`
- Create: `C:\MSA_TEMPLATE\wiki-front\tsconfig.json`
- Create: `C:\MSA_TEMPLATE\wiki-front\vite.config.ts`
- Create: `C:\MSA_TEMPLATE\wiki-front\vitest.config.ts`
- Create: `C:\MSA_TEMPLATE\wiki-front\vitest.setup.ts`
- Create: `C:\MSA_TEMPLATE\wiki-front\index.html`
- Create: `C:\MSA_TEMPLATE\wiki-front\.gitignore`
- Create: `C:\MSA_TEMPLATE\wiki-front\src\app\main.tsx`
- Create: `C:\MSA_TEMPLATE\wiki-front\src\app\App.tsx` (스텁 — Task 4에서 교체)
- Create: `C:\MSA_TEMPLATE\wiki-front\src\app\app.css` (최소 — Task 4에서 교체)
- Test: `C:\MSA_TEMPLATE\wiki-front\src\app\App.test.tsx` (스모크 — Task 4에서 교체)

**Interfaces:**
- Consumes: `../design-system/artifacts/chanho-react-0.2.0.tgz`, `chanho-tokens-0.1.0.tgz` (사전에 존재 확인)
- Produces: `pnpm dev / typecheck / test / build` 스크립트가 동작하는 빈 앱 + `App` 스텁 컴포넌트 (Task 4가 교체)

- [ ] **Step 1: 사전 확인 — tarball과 git 상태**

Run: `ls ../design-system/artifacts` (wiki-front에서)
Expected: `chanho-react-0.2.0.tgz`, `chanho-tokens-0.1.0.tgz` 포함
Run: `git status`
Expected: `main` 브랜치, 클린 (docs만 커밋된 상태)

- [ ] **Step 2: 설정 파일 8개 작성**

`package.json`:

```json
{
  "name": "wiki-front",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "vite build"
  },
  "dependencies": {
    "@chanho/react": "file:../design-system/artifacts/chanho-react-0.2.0.tgz",
    "@chanho/tokens": "file:../design-system/artifacts/chanho-tokens-0.1.0.tgz",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^26.0.0",
    "typescript": "~5.7.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

`pnpm-workspace.yaml` (독립 워크스페이스 + overrides — react와 tokens의 tarball 참조를 단일 인스턴스로 강제):

```yaml
packages:
  - "."
allowBuilds:
  esbuild: true
overrides:
  "@chanho/tokens": "file:../design-system/artifacts/chanho-tokens-0.1.0.tgz"
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts", "vitest.setup.ts"]
}
```

`vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
```

`vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    css: true,
  },
});
```

`vitest.setup.ts` (Radix 컴포넌트가 jsdom에서 요구하는 폴리필 — Select 테스트에 필수):

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  window.HTMLElement.prototype.releasePointerCapture = () => {};
}
```

`index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WIKI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:

```
node_modules/
dist/
```

- [ ] **Step 3: 의존성 설치**

Run: `pnpm install`
Expected: 에러 없이 완료, `pnpm-lock.yaml` 생성 (`allowBuilds: esbuild`가 이미 있어 빌드 승인 프롬프트 없음)

- [ ] **Step 4: 실패하는 스모크 테스트 작성**

`src\app\App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "./App";

it("앱 셸 자리표시가 렌더된다", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "WIKI" })).toBeInTheDocument();
});
```

- [ ] **Step 5: RED 확인**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./App"` (App.tsx가 아직 없음)

- [ ] **Step 6: App 스텁 + main.tsx + app.css 작성**

`src\app\App.tsx`:

```tsx
export function App() {
  return <h1>WIKI</h1>;
}
```

`src\app\app.css`:

```css
body {
  margin: 0;
  font-family: var(--chanho-font-family-sans);
  color: var(--chanho-color-text-default);
  background: var(--chanho-color-background-default);
}
```

`src\app\main.tsx` (import 순서 중요 — tokens CSS → 컴포넌트 CSS → 앱 CSS):

```tsx
import "@chanho/tokens/css";
import "@chanho/react/styles.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>,
);
```

- [ ] **Step 7: GREEN + 게이트**

Run: `pnpm test`
Expected: PASS (1 test)
Run: `pnpm typecheck && pnpm build`
Expected: 둘 다 에러 없이 통과

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "chore: wiki-front 스캐폴드 — 지라 클론 설정 미러 (Vite7/React19/TS/tarball 소비)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: wikiStore 파트 1 — 타입 + 저장(손상 가드) + 시드 + users/spaces + 페이지 조회/생성(v1 스냅샷)

스토어 골격(모듈 캐시 + localStorage `wiki.v1` + 손상 JSON 시드 재생성 + structuredClone 반환 + `__resetForTest`)과 `listUsers / getCurrentUser / listSpaces / createSpace / listPages / getPage / createPage / listVersions`를 구현한다.

> `listVersions`는 조회 함수라 스펙상 파트 2 영역이지만, **createPage의 v1 스냅샷을 테스트로 단언하려면 필요**하므로 이 태스크에서 함께 구현한다.

**Files:**
- Create: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\store\types.ts`
- Create: `C:\MSA_TEMPLATE\wiki-front\src\mock\users.ts`
- Create: `C:\MSA_TEMPLATE\wiki-front\src\mock\seed.ts`
- Create: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\store\wikiStore.ts`
- Test: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\store\wikiStore.spaces.test.ts`
- Test: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\store\wikiStore.pages.test.ts`

**Interfaces:**
- Consumes: 없음 (Task 1의 스캐폴드 위에서 동작)
- Produces (Task 3·4가 그대로 사용):
  - 타입: `User`, `Space`, `Page`, `PageVersion`, `Comment`, `WikiData`
  - `MOCK_USERS: User[]`, `CURRENT_USER_ID = "u1"`, `createSeedData(): WikiData`
  - `__resetForTest(): void`
  - `listUsers(): Promise<User[]>`
  - `getCurrentUser(): Promise<User>`
  - `listSpaces(): Promise<Space[]>`
  - `createSpace(input: { key: string; name: string }): Promise<Space>`
  - `listPages(spaceId: string): Promise<Page[]>` — position 오름차순
  - `getPage(id: string): Promise<Page | null>`
  - `createPage(input: { spaceId: string; parentId?: string | null; title: string; body?: string }): Promise<Page>` — v1 스냅샷 자동 생성
  - `listVersions(pageId: string): Promise<PageVersion[]>` — version 내림차순
  - 내부 헬퍼 `snapshotVersion(data, page, at)` (Task 3의 updatePage도 재사용)

- [ ] **Step 1: 타입 + 목업 유저 + 시드 작성**

`src\features\wiki\store\types.ts`:

```ts
export interface User {
  id: string;
  name: string;
}

export interface Space {
  id: string;
  key: string; // "DEV" 같은 대문자 접두어, 중복 금지
  name: string;
  createdAt: string;
}

export interface Page {
  id: string;
  spaceId: string;
  parentId: string | null; // null = 루트 페이지
  title: string;
  body: string; // 마크다운 원문
  position: number; // 형제 내 정렬 (생성순 max+1)
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageVersion {
  id: string;
  pageId: string;
  version: number; // 1부터 증가
  title: string;
  body: string; // 그 시점의 내용
  savedBy: string;
  savedAt: string;
}

export interface Comment {
  id: string;
  pageId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

/** localStorage `wiki.v1`에 저장되는 루트 구조 */
export interface WikiData {
  users: User[];
  spaces: Space[];
  pages: Page[];
  versions: PageVersion[];
  comments: Comment[];
}
```

`src\mock\users.ts` (alm-front과 동일 4명):

```ts
import type { User } from "../features/wiki/store/types";

export const MOCK_USERS: User[] = [
  { id: "u1", name: "김찬호" },
  { id: "u2", name: "이서연" },
  { id: "u3", name: "박준영" },
  { id: "u4", name: "최다인" },
];

/** 목업 고정 현재 유저 */
export const CURRENT_USER_ID = "u1";
```

`src\mock\seed.ts` — 본문에 백틱이 들어가므로 템플릿 리터럴 대신 줄 배열 `join("\n")`을 쓴다:

````ts
import type { Comment, Page, PageVersion, Space, WikiData } from "../features/wiki/store/types";
import { MOCK_USERS } from "./users";

const T_CREATE = "2026-07-10T09:00:00.000Z";
const T_UPDATE = "2026-07-10T10:00:00.000Z"; // pg1 v2 저장 시각
const T_COMMENT_1 = "2026-07-10T11:00:00.000Z";
const T_COMMENT_2 = "2026-07-10T11:30:00.000Z";

/** pg1 v1의 본문 (수정 전 — 버전 이력 확인용) */
const PG1_BODY_V1 = ["# 개발 위키", "", "초기 안내 문서입니다."].join("\n");

/** pg1 현재 본문 = v2 — 마크다운 렌더링 예시(제목/목록/코드블록/표)를 겸한다 */
const PG1_BODY = [
  "# 개발 위키에 오신 것을 환영합니다",
  "",
  "이 문서는 마크다운 렌더링 예시를 겸합니다.",
  "",
  "## 시작 순서",
  "",
  "1. 저장소를 클론한다",
  "2. `pnpm install`을 실행한다",
  "3. `pnpm dev`로 개발 서버를 띄운다",
  "",
  "## 주요 명령어",
  "",
  "| 명령어 | 설명 |",
  "| --- | --- |",
  "| `pnpm typecheck` | 타입 검사 |",
  "| `pnpm test` | 테스트 실행 |",
  "| `pnpm build` | 프로덕션 빌드 |",
  "",
  "## 예시 코드",
  "",
  "```ts",
  "export function greet(name: string): string {",
  "  return `안녕하세요, ${name}님!`;",
  "}",
  "```",
  "",
  "- 문서는 스페이스 단위로 관리한다",
  "- 페이지는 트리 구조로 정리한다",
].join("\n");

const PG2_BODY = ["## 회의", "", "- 데일리는 10시에 시작한다", "", "## 리뷰", "", "- PR은 24시간 안에 리뷰한다"].join("\n");
const PG3_BODY = ["## 필수 도구", "", "- Node.js 22", "- pnpm 10", "- Docker Desktop"].join("\n");
const PG4_BODY = ["## 배포 절차", "", "1. main 브랜치 태그 생성", "2. CI 파이프라인 확인"].join("\n");
const PG5_BODY = ["## MySQL 컨테이너", "", "`docker compose up -d mysql`로 띄운다."].join("\n");

export function createSeedData(): WikiData {
  const space: Space = { id: "sp1", key: "DEV", name: "개발 위키", createdAt: T_CREATE };

  const base = { spaceId: "sp1", createdAt: T_CREATE };

  const pages: Page[] = [
    // 루트 2개 — pg1은 수정 이력(v2)이 있어 updatedBy/updatedAt이 다르다
    { ...base, id: "pg1", parentId: null, title: "시작하기", body: PG1_BODY, position: 1, createdBy: "u1", updatedBy: "u2", updatedAt: T_UPDATE },
    { ...base, id: "pg2", parentId: null, title: "팀 규칙", body: PG2_BODY, position: 2, createdBy: "u1", updatedBy: "u1", updatedAt: T_CREATE },
    // pg1의 하위 2개
    { ...base, id: "pg3", parentId: "pg1", title: "개발 환경 설정", body: PG3_BODY, position: 1, createdBy: "u2", updatedBy: "u2", updatedAt: T_CREATE },
    { ...base, id: "pg4", parentId: "pg1", title: "배포 가이드", body: PG4_BODY, position: 2, createdBy: "u3", updatedBy: "u3", updatedAt: T_CREATE },
    // pg3의 하위 1개 — 깊이 3(손자) 검증용
    { ...base, id: "pg5", parentId: "pg3", title: "로컬 DB 설정", body: PG5_BODY, position: 1, createdBy: "u2", updatedBy: "u2", updatedAt: T_CREATE },
  ];

  const versions: PageVersion[] = [
    // pg1은 버전 2개 — 수정 이력 (v2 = 현재 본문)
    { id: "pv1", pageId: "pg1", version: 1, title: "시작하기", body: PG1_BODY_V1, savedBy: "u1", savedAt: T_CREATE },
    { id: "pv2", pageId: "pg1", version: 2, title: "시작하기", body: PG1_BODY, savedBy: "u2", savedAt: T_UPDATE },
    // 나머지는 각 v1 (현재 본문과 동일)
    { id: "pv3", pageId: "pg2", version: 1, title: "팀 규칙", body: PG2_BODY, savedBy: "u1", savedAt: T_CREATE },
    { id: "pv4", pageId: "pg3", version: 1, title: "개발 환경 설정", body: PG3_BODY, savedBy: "u2", savedAt: T_CREATE },
    { id: "pv5", pageId: "pg4", version: 1, title: "배포 가이드", body: PG4_BODY, savedBy: "u3", savedAt: T_CREATE },
    { id: "pv6", pageId: "pg5", version: 1, title: "로컬 DB 설정", body: PG5_BODY, savedBy: "u2", savedAt: T_CREATE },
  ];

  const comments: Comment[] = [
    { id: "c1", pageId: "pg1", authorId: "u2", body: "온보딩에 딱 필요한 내용이네요.", createdAt: T_COMMENT_1 },
    { id: "c2", pageId: "pg1", authorId: "u3", body: "배포 가이드 링크도 추가하면 좋겠습니다.", createdAt: T_COMMENT_2 },
  ];

  return {
    users: [...MOCK_USERS],
    spaces: [space],
    pages,
    versions,
    comments,
  };
}
````

- [ ] **Step 2: users/spaces 실패 테스트 작성**

`src\features\wiki\store\wikiStore.spaces.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createSpace,
  getCurrentUser,
  listSpaces,
  listUsers,
} from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("users", () => {
  it("목업 유저 4명을 반환한다", async () => {
    const users = await listUsers();
    expect(users).toHaveLength(4);
    expect(users[0]).toEqual({ id: "u1", name: "김찬호" });
  });

  it("현재 유저는 u1 고정이다", async () => {
    await expect(getCurrentUser()).resolves.toEqual({ id: "u1", name: "김찬호" });
  });
});

describe("spaces", () => {
  it("첫 실행 시 시드 스페이스(개발 위키)가 생성되고 localStorage에 저장된다", async () => {
    const spaces = await listSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]).toMatchObject({ id: "sp1", key: "DEV", name: "개발 위키" });
    expect(localStorage.getItem("wiki.v1")).not.toBeNull();
  });

  it("createSpace는 키를 대문자로 정규화해 저장한다", async () => {
    const space = await createSpace({ key: "arch", name: "설계 위키" });
    expect(space.key).toBe("ARCH");
    const spaces = await listSpaces();
    expect(spaces.map((s) => s.key)).toEqual(["DEV", "ARCH"]);
  });

  it("키가 중복되면 한국어 메시지로 거부한다 (대소문자 무시)", async () => {
    await expect(createSpace({ key: "dev", name: "중복" })).rejects.toThrow(
      "이미 존재하는 스페이스 키입니다: DEV",
    );
  });

  it("키/이름이 비어 있으면 거부한다", async () => {
    await expect(createSpace({ key: "  ", name: "이름" })).rejects.toThrow(
      "스페이스 키를 입력하세요",
    );
    await expect(createSpace({ key: "ARCH", name: "  " })).rejects.toThrow(
      "스페이스 이름을 입력하세요",
    );
  });

  it("생성한 스페이스는 메모리 캐시 리셋 후에도 localStorage에서 조회된다", async () => {
    await createSpace({ key: "ARCH", name: "설계 위키" });
    __resetForTest(); // 캐시만 비움 — localStorage는 유지
    const spaces = await listSpaces();
    expect(spaces.map((s) => s.key)).toEqual(["DEV", "ARCH"]);
  });

  it("localStorage가 손상된 JSON이면 시드로 재생성한다", async () => {
    localStorage.setItem("wiki.v1", "{corrupted!!");
    __resetForTest();
    const spaces = await listSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0].key).toBe("DEV");
    expect(localStorage.getItem("wiki.v1")).not.toContain("corrupted");
  });
});
```

- [ ] **Step 3: RED 확인**

Run: `pnpm test src/features/wiki/store/wikiStore.spaces.test.ts`
Expected: FAIL — `Failed to resolve import "./wikiStore"` (wikiStore.ts가 아직 없음)

- [ ] **Step 4: wikiStore 골격 + users/spaces 구현**

`src\features\wiki\store\wikiStore.ts`:

```ts
import type { Page, PageVersion, Space, User, WikiData } from "./types";
import { CURRENT_USER_ID } from "../../../mock/users";
import { createSeedData } from "../../../mock/seed";

const STORAGE_KEY = "wiki.v1";

let cache: WikiData | null = null;

function load(): WikiData {
  if (cache) return cache;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      cache = JSON.parse(raw) as WikiData;
    } catch {
      // 손상된 JSON — 시드로 재생성
    }
  }
  if (!cache) {
    cache = createSeedData();
    persist();
  }
  return cache;
}

function persist(): void {
  if (cache) localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

/** 내부 상태 유출 방지 — 반환값은 항상 깊은 복사본 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

function nextId(): string {
  return crypto.randomUUID();
}

/** 테스트 전용: 메모리 캐시를 초기화한다 (localStorage는 건드리지 않음). */
export function __resetForTest(): void {
  cache = null;
}

// ── users ────────────────────────────────────────────────────

export async function listUsers(): Promise<User[]> {
  return clone(load().users);
}

export async function getCurrentUser(): Promise<User> {
  const user = load().users.find((u) => u.id === CURRENT_USER_ID);
  if (!user) throw new Error("현재 사용자를 찾을 수 없습니다");
  return clone(user);
}

// ── spaces ───────────────────────────────────────────────────

export async function listSpaces(): Promise<Space[]> {
  return clone(load().spaces);
}

export async function createSpace(input: { key: string; name: string }): Promise<Space> {
  const data = load();
  const key = input.key.trim().toUpperCase();
  const name = input.name.trim();
  if (!key) throw new Error("스페이스 키를 입력하세요");
  if (!name) throw new Error("스페이스 이름을 입력하세요");
  if (data.spaces.some((s) => s.key === key)) {
    throw new Error(`이미 존재하는 스페이스 키입니다: ${key}`);
  }
  const space: Space = { id: nextId(), key, name, createdAt: new Date().toISOString() };
  data.spaces.push(space);
  persist();
  return clone(space);
}

// ── pages ────────────────────────────────────────────────────

export async function listPages(spaceId: string): Promise<Page[]> {
  return clone(
    load()
      .pages.filter((p) => p.spaceId === spaceId)
      .sort((a, b) => a.position - b.position),
  );
}

export async function getPage(id: string): Promise<Page | null> {
  const page = load().pages.find((p) => p.id === id);
  return page ? clone(page) : null;
}

/** 버전 스냅샷 부수효과: 현재 페이지 내용을 version = max+1로 쌓는다 */
function snapshotVersion(data: WikiData, page: Page, at: string): void {
  const maxVersion = data.versions
    .filter((v) => v.pageId === page.id)
    .reduce((max, v) => Math.max(max, v.version), 0);
  data.versions.push({
    id: nextId(),
    pageId: page.id,
    version: maxVersion + 1,
    title: page.title,
    body: page.body,
    savedBy: CURRENT_USER_ID,
    savedAt: at,
  });
}

export async function createPage(input: {
  spaceId: string;
  parentId?: string | null;
  title: string;
  body?: string;
}): Promise<Page> {
  const data = load();
  if (!data.spaces.some((s) => s.id === input.spaceId)) {
    throw new Error("스페이스를 찾을 수 없습니다");
  }
  const parentId = input.parentId ?? null;
  if (parentId !== null) {
    const parent = data.pages.find((p) => p.id === parentId);
    if (!parent) throw new Error("부모 페이지를 찾을 수 없습니다");
    if (parent.spaceId !== input.spaceId) {
      throw new Error("부모 페이지가 같은 스페이스에 없습니다");
    }
  }
  const title = input.title.trim();
  if (!title) throw new Error("페이지 제목을 입력하세요");
  const now = new Date().toISOString();
  // position = 형제(같은 스페이스·같은 부모) 내 max+1
  const maxPosition = data.pages
    .filter((p) => p.spaceId === input.spaceId && p.parentId === parentId)
    .reduce((max, p) => Math.max(max, p.position), 0);
  const page: Page = {
    id: nextId(),
    spaceId: input.spaceId,
    parentId,
    title,
    body: input.body ?? "",
    position: maxPosition + 1,
    createdBy: CURRENT_USER_ID,
    updatedBy: CURRENT_USER_ID,
    createdAt: now,
    updatedAt: now,
  };
  data.pages.push(page);
  snapshotVersion(data, page, now); // v1 자동 스냅샷
  persist();
  return clone(page);
}

// ── versions ─────────────────────────────────────────────────

export async function listVersions(pageId: string): Promise<PageVersion[]> {
  return clone(
    load()
      .versions.filter((v) => v.pageId === pageId)
      .sort((a, b) => b.version - a.version), // 최신 먼저
  );
}
```

- [ ] **Step 5: spaces 테스트 GREEN 확인**

Run: `pnpm test src/features/wiki/store/wikiStore.spaces.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: 페이지 조회/생성 실패 테스트 작성**

`src\features\wiki\store\wikiStore.pages.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createPage,
  getPage,
  listPages,
  listVersions,
} from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("listPages / getPage", () => {
  it("시드에 페이지 5개가 position 오름차순으로, 깊이 3 트리로 들어 있다", async () => {
    const pages = await listPages("sp1");
    expect(pages).toHaveLength(5);
    // position 오름차순 (1,1,1,2,2 순 — 트리 구성은 화면 몫)
    expect(pages.map((p) => p.position)).toEqual([1, 1, 1, 2, 2]);
    const byId = new Map(pages.map((p) => [p.id, p]));
    expect(byId.get("pg3")?.parentId).toBe("pg1"); // 하위
    expect(byId.get("pg5")?.parentId).toBe("pg3"); // 손자 (깊이 3)
    expect(pages.filter((p) => p.parentId === null).map((p) => p.id)).toEqual(["pg1", "pg2"]);
  });

  it("다른 스페이스의 페이지는 반환하지 않는다", async () => {
    await expect(listPages("없는스페이스")).resolves.toEqual([]);
  });

  it("getPage는 존재하면 페이지를, 없으면 null을 반환한다", async () => {
    const page = await getPage("pg1");
    expect(page).toMatchObject({ id: "pg1", title: "시작하기", parentId: null });
    await expect(getPage("없는id")).resolves.toBeNull();
  });

  it("시드 pg1 본문에는 마크다운 예시(제목/목록/코드블록/표)가 들어 있다", async () => {
    const page = (await getPage("pg1"))!;
    expect(page.body).toContain("# 개발 위키에 오신 것을 환영합니다");
    expect(page.body).toContain("1. 저장소를 클론한다");
    expect(page.body).toContain("```ts");
    expect(page.body).toContain("| 명령어 | 설명 |");
  });

  it("시드 pg1에는 버전 2개가 최신순으로 들어 있고, v2가 현재 본문과 같다", async () => {
    const versions = await listVersions("pg1");
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0].id).toBe("pv2");
    expect(versions[0].body).toBe((await getPage("pg1"))!.body);
    expect(versions[1].body).not.toBe(versions[0].body);
  });
});

describe("createPage", () => {
  it("v1 스냅샷을 자동 생성한다", async () => {
    const page = await createPage({ spaceId: "sp1", title: "새 문서", body: "# 초안" });
    expect(page).toMatchObject({
      spaceId: "sp1",
      parentId: null,
      title: "새 문서",
      body: "# 초안",
      createdBy: "u1",
      updatedBy: "u1",
    });
    const versions = await listVersions(page.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      pageId: page.id,
      version: 1,
      title: "새 문서",
      body: "# 초안",
      savedBy: "u1",
    });
  });

  it("body 생략 시 빈 문자열로 생성한다", async () => {
    const page = await createPage({ spaceId: "sp1", title: "빈 문서" });
    expect(page.body).toBe("");
  });

  it("position은 형제 내 max+1이다 — 루트", async () => {
    const page = await createPage({ spaceId: "sp1", title: "세 번째 루트" });
    expect(page.position).toBe(3); // pg1=1, pg2=2 다음
  });

  it("position은 형제 내 max+1이다 — pg1의 하위", async () => {
    const page = await createPage({ spaceId: "sp1", parentId: "pg1", title: "세 번째 하위" });
    expect(page.parentId).toBe("pg1");
    expect(page.position).toBe(3); // pg3=1, pg4=2 다음
  });

  it("제목이 비어 있으면 거부한다", async () => {
    await expect(createPage({ spaceId: "sp1", title: "  " })).rejects.toThrow(
      "페이지 제목을 입력하세요",
    );
  });

  it("스페이스가 없으면 거부한다", async () => {
    await expect(createPage({ spaceId: "없는id", title: "문서" })).rejects.toThrow(
      "스페이스를 찾을 수 없습니다",
    );
  });

  it("부모 페이지가 없으면 거부한다", async () => {
    await expect(
      createPage({ spaceId: "sp1", parentId: "없는id", title: "문서" }),
    ).rejects.toThrow("부모 페이지를 찾을 수 없습니다");
  });
});
```

- [ ] **Step 7: RED→GREEN 확인**

Run: `pnpm test src/features/wiki/store/wikiStore.pages.test.ts`
Expected: Step 4에서 이미 구현했으므로 PASS (12 tests). **만약 FAIL이면 시드 상수(id/제목/position)와 구현을 이 계획서의 표와 대조해 수정한다 — 테스트를 고치지 말 것.**

> 참고: 이 사이클은 테스트 대상 함수가 Step 4에서 함께 구현돼 RED가 생략된다. Step 3의 RED(모듈 부재)가 이 태스크의 RED 관찰이다.

- [ ] **Step 8: 게이트**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 통과 (테스트 총 21개: 스모크 1 + spaces 8 + pages 12)

- [ ] **Step 9: 커밋**

```bash
git add src/features/wiki/store src/mock
git commit -m "feat: wikiStore 파트1 — 타입/저장(손상 가드)/시드/스페이스/페이지 생성(v1 스냅샷)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: wikiStore 파트 2 — 코멘트 + updatePage(버전·no-op) + deletePage(거부·연쇄) + restoreVersion

스펙 §7 필수 스토어 테스트 전부를 이 태스크에서 마저 채운다: 버전 스냅샷(실변경만)·no-op, 삭제 거부·연쇄, 복원이 새 버전 생성. (키 중복·손상 재생성은 Task 2에서 완료.)

**Files:**
- Modify: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\store\wikiStore.ts` (함수 추가)
- Test: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\store\wikiStore.comments.test.ts`
- Test: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\store\wikiStore.versions.test.ts`

**Interfaces:**
- Consumes (Task 2): `load/persist/clone/nextId/snapshotVersion`, `CURRENT_USER_ID`, 타입 `Page/PageVersion/Comment/WikiData`, `getPage`, `listVersions`
- Produces (Task 4·W2·W3이 사용):
  - `listComments(pageId: string): Promise<Comment[]>` — createdAt 오름차순
  - `addComment(pageId: string, body: string): Promise<Comment>` — 빈 본문 throw
  - `updatePage(id: string, patch: { title?: string; body?: string }): Promise<Page>` — 실변경 시에만 새 버전 + updatedBy/updatedAt, 무변경 no-op
  - `deletePage(id: string): Promise<void>` — 하위 존재 시 throw, 코멘트·버전 연쇄 삭제
  - `restoreVersion(pageId: string, versionId: string): Promise<Page>` — updatePage 경로 재사용

- [ ] **Step 1: 코멘트 실패 테스트 작성**

`src\features\wiki\store\wikiStore.comments.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, addComment, listComments } from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("comments", () => {
  it("시드 pg1 코멘트 2개를 createdAt 오름차순으로 반환한다", async () => {
    const comments = await listComments("pg1");
    expect(comments.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(comments[0].authorId).toBe("u2");
  });

  it("코멘트 없는 페이지는 빈 배열을 반환한다", async () => {
    await expect(listComments("pg2")).resolves.toEqual([]);
  });

  it("addComment는 현재 유저(u1)로 코멘트를 추가하고 목록에 반영한다", async () => {
    const comment = await addComment("pg2", "  규칙 좋네요  ");
    expect(comment).toMatchObject({ pageId: "pg2", authorId: "u1", body: "규칙 좋네요" });
    const comments = await listComments("pg2");
    expect(comments.map((c) => c.id)).toEqual([comment.id]);
  });

  it("빈 본문이면 거부한다", async () => {
    await expect(addComment("pg1", "   ")).rejects.toThrow("코멘트 내용을 입력하세요");
  });

  it("없는 페이지면 거부한다", async () => {
    await expect(addComment("없는id", "본문")).rejects.toThrow("페이지를 찾을 수 없습니다");
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test src/features/wiki/store/wikiStore.comments.test.ts`
Expected: FAIL — `does not provide an export named 'addComment'` (또는 listComments)

- [ ] **Step 3: 코멘트 구현**

`wikiStore.ts` 끝에 추가하고, 파일 상단 import의 타입 목록에 `Comment`를 추가한다:

```ts
import type { Comment, Page, PageVersion, Space, User, WikiData } from "./types";
```

```ts
// ── comments ─────────────────────────────────────────────────

export async function listComments(pageId: string): Promise<Comment[]> {
  return clone(
    load()
      .comments.filter((c) => c.pageId === pageId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export async function addComment(pageId: string, body: string): Promise<Comment> {
  const data = load();
  if (!data.pages.some((p) => p.id === pageId)) {
    throw new Error("페이지를 찾을 수 없습니다");
  }
  const trimmed = body.trim();
  if (!trimmed) throw new Error("코멘트 내용을 입력하세요");
  const comment: Comment = {
    id: nextId(),
    pageId,
    authorId: CURRENT_USER_ID,
    body: trimmed,
    createdAt: new Date().toISOString(),
  };
  data.comments.push(comment);
  persist();
  return clone(comment);
}
```

- [ ] **Step 4: 코멘트 GREEN 확인**

Run: `pnpm test src/features/wiki/store/wikiStore.comments.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: updatePage/deletePage/restoreVersion 실패 테스트 작성**

`src\features\wiki\store\wikiStore.versions.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  addComment,
  deletePage,
  getPage,
  listVersions,
  restoreVersion,
  updatePage,
} from "./wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("updatePage", () => {
  it("body 실변경 시 새 버전(max+1)을 스냅샷하고 updatedBy/updatedAt을 갱신한다", async () => {
    const before = (await getPage("pg1"))!; // 시드: updatedBy u2, 버전 2개
    const updated = await updatePage("pg1", { body: "# 완전히 새 본문" });
    expect(updated.body).toBe("# 완전히 새 본문");
    expect(updated.updatedBy).toBe("u1"); // 현재 유저로 갱신
    expect(updated.updatedAt).not.toBe(before.updatedAt);
    const versions = await listVersions("pg1");
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0]).toMatchObject({ title: "시작하기", body: "# 완전히 새 본문", savedBy: "u1" });
  });

  it("title만 변경해도 새 버전을 스냅샷한다", async () => {
    await updatePage("pg2", { title: "팀 그라운드 룰" });
    const versions = await listVersions("pg2");
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0].title).toBe("팀 그라운드 룰");
    expect(versions[1].title).toBe("팀 규칙");
  });

  it("둘 다 무변경이면 no-op — 버전·updatedAt 불변", async () => {
    const before = (await getPage("pg2"))!;
    const result = await updatePage("pg2", { title: before.title, body: before.body });
    expect(result.updatedAt).toBe(before.updatedAt);
    expect(await listVersions("pg2")).toHaveLength(1);
  });

  it("빈 patch도 no-op이다", async () => {
    const before = (await getPage("pg2"))!;
    const result = await updatePage("pg2", {});
    expect(result.updatedAt).toBe(before.updatedAt);
    expect(await listVersions("pg2")).toHaveLength(1);
  });

  it("제목을 빈 문자열로 바꾸려 하면 거부한다", async () => {
    await expect(updatePage("pg2", { title: "  " })).rejects.toThrow("페이지 제목을 입력하세요");
  });

  it("없는 페이지면 거부한다", async () => {
    await expect(updatePage("없는id", { title: "제목" })).rejects.toThrow(
      "페이지를 찾을 수 없습니다",
    );
  });
});

describe("deletePage", () => {
  it("하위 페이지가 있으면 거부한다", async () => {
    await expect(deletePage("pg1")).rejects.toThrow("하위 페이지가 있어 삭제할 수 없습니다");
    await expect(deletePage("pg3")).rejects.toThrow("하위 페이지가 있어 삭제할 수 없습니다");
  });

  it("리프 삭제 시 페이지·버전·코멘트를 연쇄 삭제한다", async () => {
    await addComment("pg5", "삭제 전 코멘트");
    await updatePage("pg5", { body: "## 수정된 본문" }); // 버전 2개로 만든 뒤 삭제
    await deletePage("pg5");
    expect(await getPage("pg5")).toBeNull();
    // 저장소 원본에서 잔여물이 실제로 제거됐는지 확인 (조회 API의 필터가 아니라)
    const raw = JSON.parse(localStorage.getItem("wiki.v1")!) as {
      pages: { id: string }[];
      versions: { pageId: string }[];
      comments: { pageId: string }[];
    };
    expect(raw.pages.some((p) => p.id === "pg5")).toBe(false);
    expect(raw.versions.some((v) => v.pageId === "pg5")).toBe(false);
    expect(raw.comments.some((c) => c.pageId === "pg5")).toBe(false);
  });

  it("없는 페이지면 거부한다", async () => {
    await expect(deletePage("없는id")).rejects.toThrow("페이지를 찾을 수 없습니다");
  });
});

describe("restoreVersion", () => {
  it("과거 버전 복원은 새 버전으로 쌓인다 — 히스토리가 끊기지 않는다", async () => {
    const v1 = (await listVersions("pg1")).find((v) => v.version === 1)!; // pv1
    const restored = await restoreVersion("pg1", v1.id);
    expect(restored.body).toBe(v1.body); // v1 내용으로 복원
    const versions = await listVersions("pg1");
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]); // v3가 새로 쌓임
    expect(versions[0].body).toBe(v1.body);
  });

  it("최신 버전과 같은 내용의 복원은 no-op이다 (updatePage 경로 재사용)", async () => {
    await restoreVersion("pg1", "pv2"); // pv2 = 현재 본문과 동일
    expect(await listVersions("pg1")).toHaveLength(2);
  });

  it("없는 버전이면 거부한다", async () => {
    await expect(restoreVersion("pg1", "없는id")).rejects.toThrow("버전을 찾을 수 없습니다");
  });

  it("다른 페이지의 버전 id로는 복원할 수 없다", async () => {
    await expect(restoreVersion("pg2", "pv1")).rejects.toThrow("버전을 찾을 수 없습니다");
  });
});
```

- [ ] **Step 6: RED 확인**

Run: `pnpm test src/features/wiki/store/wikiStore.versions.test.ts`
Expected: FAIL — `does not provide an export named 'deletePage'` (또는 updatePage/restoreVersion)

- [ ] **Step 7: updatePage/deletePage/restoreVersion 구현**

`wikiStore.ts`의 `// ── versions ──` 섹션(listVersions 근처)에 추가:

```ts
export async function updatePage(
  id: string,
  patch: { title?: string; body?: string },
): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  const nextTitle = patch.title !== undefined ? patch.title.trim() : page.title;
  if (!nextTitle) throw new Error("페이지 제목을 입력하세요");
  const nextBody = patch.body !== undefined ? patch.body : page.body;
  // 둘 다 무변경이면 no-op — 버전·updatedBy/updatedAt 불변
  if (nextTitle === page.title && nextBody === page.body) {
    return clone(page);
  }
  page.title = nextTitle;
  page.body = nextBody;
  page.updatedBy = CURRENT_USER_ID;
  page.updatedAt = new Date().toISOString();
  snapshotVersion(data, page, page.updatedAt); // 적용 후 내용을 새 버전(max+1)으로
  persist();
  return clone(page);
}

export async function deletePage(id: string): Promise<void> {
  const data = load();
  const index = data.pages.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("페이지를 찾을 수 없습니다");
  if (data.pages.some((p) => p.parentId === id)) {
    throw new Error("하위 페이지가 있어 삭제할 수 없습니다");
  }
  data.pages.splice(index, 1);
  data.versions = data.versions.filter((v) => v.pageId !== id); // 버전 연쇄 삭제
  data.comments = data.comments.filter((c) => c.pageId !== id); // 코멘트 연쇄 삭제
  persist();
}

export async function restoreVersion(pageId: string, versionId: string): Promise<Page> {
  const data = load();
  const version = data.versions.find((v) => v.id === versionId && v.pageId === pageId);
  if (!version) throw new Error("버전을 찾을 수 없습니다");
  // updatePage 경로 재사용 → 복원도 새 버전으로 쌓인다 (히스토리 안 끊김)
  return updatePage(pageId, { title: version.title, body: version.body });
}
```

- [ ] **Step 8: GREEN + 게이트**

Run: `pnpm test src/features/wiki/store/wikiStore.versions.test.ts`
Expected: PASS (13 tests)
Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 통과 — 스토어 13함수 전부 구현 완료 (스펙 §5 대비: listUsers/getCurrentUser/listSpaces/createSpace/listPages/getPage/createPage/updatePage/deletePage/listVersions/restoreVersion/listComments/addComment ✓)

- [ ] **Step 9: 커밋**

```bash
git add src/features/wiki/store
git commit -m "feat: wikiStore 파트2 — 버전 스냅샷(실변경만)/삭제 연쇄/복원/코멘트" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 앱 셸 — WikiLayout + PageTree + 라우팅 + SpaceCreateModal + EmptyState (RTL 핵심 흐름)

라우팅: `/spaces/:spaceId/pages/:pageId`(보기 스텁), `/spaces/:spaceId`(index → 첫 루트 페이지 redirect 또는 페이지 0개 안내), `*` catch-all → 첫 스페이스. 사이드바 = 스페이스 스위처 Select + 접이식 페이지 트리(기본 펼침, NavLink 하이라이트) + 새 스페이스 모달. 우상단 현재 유저 Avatar. **검색 TextField 없음(W3), 페이지 생성 버튼 없음(W2).**

**Files:**
- Create: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\components\PageTree.tsx`
- Create: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\components\SpaceCreateModal.tsx`
- Create: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\components\EmptySpaces.tsx`
- Create: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\components\WikiLayout.tsx`
- Create: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\pages\SpaceIndexPage.tsx`
- Create: `C:\MSA_TEMPLATE\wiki-front\src\features\wiki\pages\PageViewPage.tsx`
- Modify: `C:\MSA_TEMPLATE\wiki-front\src\app\App.tsx` (스텁 전체 교체)
- Modify: `C:\MSA_TEMPLATE\wiki-front\src\app\app.css` (전체 교체)
- Test: `C:\MSA_TEMPLATE\wiki-front\src\app\App.test.tsx` (스모크 전체 교체)

**Interfaces:**
- Consumes (Task 2·3): `listSpaces`, `listPages`, `getPage`, `getCurrentUser`, `createSpace`, `__resetForTest`, 타입 `Space/Page/User`, `MOCK_USERS`
- Consumes (@chanho/react — 실제 props): `Select({ label, options: {value,label}[], value, onValueChange })`, `Modal({ trigger, title, description, open, onOpenChange })`, `TextField({ label, value, onChange, placeholder, description })`, `Button({ variant?, size?, type?, disabled? })`, `Avatar({ name, size? })`, `Spinner({ size?, label? })`, `ToastProvider`, `useToast()` → `toast({ title, description?, appearance? })`
- Produces (W2가 사용): `WikiLayout`(+`WikiOutletContext { pages: Page[] | null }`), `PageTree`, `SpaceCreateModal`, `PageViewPage`(W2에서 본문 렌더로 확장), 라우트 구조

- [ ] **Step 1: 실패하는 RTL 핵심 흐름 테스트 작성 (스모크 테스트 전체 교체)**

`src\app\App.test.tsx` 전체를 다음으로 교체:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "./App";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { MOCK_USERS } from "../mock/users";

/** 현재 pathname을 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderApp(initialPath = "/") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("App 라우팅과 위키 W1 흐름", () => {
  it("스페이스가 0개면 EmptyState를 보여준다", async () => {
    // 시드를 우회해 빈 데이터를 미리 심는다
    localStorage.setItem(
      "wiki.v1",
      JSON.stringify({ users: MOCK_USERS, spaces: [], pages: [], versions: [], comments: [] }),
    );
    renderApp();
    expect(
      await screen.findByRole("heading", { name: "아직 스페이스가 없습니다" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "첫 스페이스 만들기" })).toBeInTheDocument();
  });

  it("루트 접근 시 첫 스페이스의 첫 루트 페이지로 redirect하고, 트리가 깊이 3 계층을 렌더한다", async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg1");
    });
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    // 루트 2 + 하위 2 + 손자 1 전부 표시 (기본 펼침)
    expect(within(tree).getByRole("link", { name: "시작하기" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "팀 규칙" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "개발 환경 설정" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "배포 가이드" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
    // 현재 페이지(시작하기) 하이라이트
    expect(within(tree).getByRole("link", { name: "시작하기" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("토글로 하위를 접으면 손자 페이지가 사라지고, 다시 펼치면 나타난다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("link", { name: "로컬 DB 설정" });
    await user.click(screen.getByRole("button", { name: "개발 환경 설정 하위 접기" }));
    expect(screen.queryByRole("link", { name: "로컬 DB 설정" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "개발 환경 설정 하위 펼치기" }));
    expect(screen.getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
  });

  it("트리에서 다른 페이지를 클릭하면 URL이 바뀌고 그 페이지가 표시된다", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("link", { name: "팀 규칙" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg2");
    });
    expect(await screen.findByRole("heading", { name: "팀 규칙" })).toBeInTheDocument();
  });

  it("새 스페이스를 만들면 스위처에 반영되고, 페이지 0개 EmptyState가 보인다", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("link", { name: "시작하기" });
    // 모달 열기 → 입력 → 생성
    await user.click(screen.getByRole("button", { name: "새 스페이스" }));
    await user.type(screen.getByLabelText("이름"), "설계 위키");
    await user.type(screen.getByLabelText("키"), "arch");
    expect(screen.getByLabelText("키")).toHaveValue("ARCH"); // 자동 대문자
    await user.click(screen.getByRole("button", { name: "만들기" }));
    // 스위처가 새 스페이스로 바뀌고 그 스페이스로 이동
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "스페이스" })).toHaveTextContent(
        "설계 위키 (ARCH)",
      );
    });
    expect(screen.getByTestId("location").textContent).toMatch(/^\/spaces\/[^/]+$/);
    // 새 스페이스는 페이지 0개 → 안내문 EmptyState (만들기 버튼은 W2)
    expect(
      await screen.findByRole("heading", { name: "아직 페이지가 없습니다" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test src/app/App.test.tsx`
Expected: FAIL — 5개 전부 실패. 스텁 `App`에는 라우팅/트리가 없으므로 `Unable to find role="heading"` / `Unable to find role="navigation"` 류의 실패

- [ ] **Step 3: PageTree 구현**

`src\features\wiki\components\PageTree.tsx`:

```tsx
import { useState } from "react";
import { NavLink } from "react-router";
import type { Page } from "../store/types";

export interface PageTreeProps {
  spaceId: string;
  pages: Page[];
}

interface TreeNode {
  page: Page;
  children: TreeNode[];
}

/** parentId 인접 리스트 → 트리. 형제는 position 오름차순. */
function buildTree(pages: Page[]): TreeNode[] {
  const byParent = new Map<string | null, Page[]>();
  for (const page of pages) {
    const siblings = byParent.get(page.parentId) ?? [];
    siblings.push(page);
    byParent.set(page.parentId, siblings);
  }
  const toNodes = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((page) => ({ page, children: toNodes(page.id) }));
  return toNodes(null);
}

/** 접이식 페이지 트리 — 기본 전부 펼침, 조회/탐색 전용 (생성·정렬은 W2) */
export function PageTree({ spaceId, pages }: PageTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const roots = buildTree(pages);

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNodes = (nodes: TreeNode[]) => (
    <ul className="page-tree-list">
      {nodes.map(({ page, children }) => {
        const isCollapsed = collapsed.has(page.id);
        return (
          <li key={page.id}>
            <div className="page-tree-row">
              {children.length > 0 ? (
                <button
                  type="button"
                  className="page-tree-toggle"
                  aria-expanded={!isCollapsed}
                  aria-label={
                    isCollapsed ? `${page.title} 하위 펼치기` : `${page.title} 하위 접기`
                  }
                  onClick={() => toggle(page.id)}
                >
                  {isCollapsed ? "▸" : "▾"}
                </button>
              ) : (
                <span className="page-tree-toggle-spacer" aria-hidden="true" />
              )}
              <NavLink to={`/spaces/${spaceId}/pages/${page.id}`}>{page.title}</NavLink>
            </div>
            {children.length > 0 && !isCollapsed ? renderNodes(children) : null}
          </li>
        );
      })}
    </ul>
  );

  if (roots.length === 0) {
    return <p className="page-tree-empty">페이지 없음</p>;
  }
  return (
    <nav className="page-tree" aria-label="페이지 트리">
      {renderNodes(roots)}
    </nav>
  );
}
```

- [ ] **Step 4: SpaceCreateModal + EmptySpaces 구현 (지라 ProjectCreateModal 미러)**

`src\features\wiki\components\SpaceCreateModal.tsx`:

```tsx
import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Modal, TextField, useToast } from "@chanho/react";
import type { Space } from "../store/types";
import { createSpace } from "../store/wikiStore";

export interface SpaceCreateModalProps {
  /** 트리거 버튼 문구 */
  triggerLabel?: string;
  onCreated: (space: Space) => void | Promise<void>;
}

export function SpaceCreateModal({ triggerLabel = "새 스페이스", onCreated }: SpaceCreateModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const toast = useToast();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      setKey("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const space = await createSpace({ key, name });
      toast({ title: `스페이스 ${space.key}를 만들었습니다`, appearance: "success" });
      handleOpenChange(false);
      await onCreated(space);
    } catch (error) {
      toast({
        title: "스페이스 생성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <Modal
      trigger={<Button variant="subtle">{triggerLabel}</Button>}
      title="새 스페이스"
      description="이름과 키를 입력하세요. 키는 스페이스를 구분하는 접두어가 됩니다."
      open={open}
      onOpenChange={handleOpenChange}
    >
      <form className="space-create-form" onSubmit={handleSubmit}>
        <TextField
          label="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 개발 위키"
        />
        <TextField
          label="키"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          placeholder="예: DEV"
          description="대문자로 자동 변환됩니다"
        />
        <Button type="submit" disabled={!name.trim() || !key.trim()}>
          만들기
        </Button>
      </form>
    </Modal>
  );
}
```

`src\features\wiki\components\EmptySpaces.tsx`:

```tsx
import type { Space } from "../store/types";
import { SpaceCreateModal } from "./SpaceCreateModal";

export interface EmptySpacesProps {
  onCreated: (space: Space) => void | Promise<void>;
}

export function EmptySpaces({ onCreated }: EmptySpacesProps) {
  return (
    <div className="empty-spaces">
      <h1>아직 스페이스가 없습니다</h1>
      <p>첫 스페이스를 만들어 위키를 시작하세요.</p>
      <SpaceCreateModal triggerLabel="첫 스페이스 만들기" onCreated={onCreated} />
    </div>
  );
}
```

- [ ] **Step 5: WikiLayout + SpaceIndexPage + PageViewPage 구현**

`src\features\wiki\components\WikiLayout.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate, useParams } from "react-router";
import { Avatar, Select, Spinner } from "@chanho/react";
import type { Page, Space, User } from "../store/types";
import { getCurrentUser, listPages } from "../store/wikiStore";
import { PageTree } from "./PageTree";
import { SpaceCreateModal } from "./SpaceCreateModal";

export interface WikiLayoutProps {
  spaces: Space[];
  /** 스페이스 목록이 바뀌었을 때(생성 등) App이 다시 로드하도록 알린다 */
  onSpacesChanged: () => void | Promise<void>;
}

/** Outlet으로 하위 라우트에 전달하는 컨텍스트 (SpaceIndexPage가 사용) */
export interface WikiOutletContext {
  pages: Page[] | null;
}

export function WikiLayout({ spaces, onSpacesChanged }: WikiLayoutProps) {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<User | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);

  useEffect(() => {
    void getCurrentUser().then(setMe);
  }, []);

  const current = spaces.find((s) => s.id === spaceId);
  const currentId = current?.id ?? null;

  useEffect(() => {
    if (!currentId) return;
    setPages(null);
    void listPages(currentId).then(setPages);
  }, [currentId]);

  if (!current) {
    // 존재하지 않는 스페이스 ID → 첫 스페이스로
    return <Navigate to={`/spaces/${spaces[0].id}`} replace />;
  }

  return (
    <div className="wiki-layout">
      <aside className="wiki-sidebar">
        <div className="wiki-sidebar-brand">WIKI</div>
        <Select
          label="스페이스"
          options={spaces.map((s) => ({ value: s.id, label: `${s.name} (${s.key})` }))}
          value={current.id}
          onValueChange={(id) => navigate(`/spaces/${id}`)}
        />
        {pages === null ? (
          <Spinner size="small" label="페이지 트리 로딩 중" />
        ) : (
          <PageTree spaceId={current.id} pages={pages} />
        )}
        <SpaceCreateModal
          onCreated={async (space) => {
            await onSpacesChanged();
            navigate(`/spaces/${space.id}`);
          }}
        />
      </aside>
      <div className="wiki-main">
        <header className="wiki-header">{me ? <Avatar name={me.name} size="small" /> : null}</header>
        <main className="wiki-content">
          <Outlet context={{ pages } satisfies WikiOutletContext} />
        </main>
      </div>
    </div>
  );
}
```

`src\features\wiki\pages\SpaceIndexPage.tsx`:

```tsx
import { Navigate, useOutletContext, useParams } from "react-router";
import { Spinner } from "@chanho/react";
import type { WikiOutletContext } from "../components/WikiLayout";

/** /spaces/:spaceId index — 첫 루트 페이지로 redirect, 페이지 0개면 안내 EmptyState */
export function SpaceIndexPage() {
  const { spaceId } = useParams();
  const { pages } = useOutletContext<WikiOutletContext>();

  if (pages === null) {
    return <Spinner label="페이지 로딩 중" />;
  }
  const roots = pages
    .filter((p) => p.parentId === null)
    .sort((a, b) => a.position - b.position);
  if (roots.length === 0) {
    // 페이지 생성 라우트(/new)는 W2 — W1은 안내문만
    return (
      <div className="empty-pages">
        <h2>아직 페이지가 없습니다</h2>
        <p>첫 페이지 만들기는 다음 단계(W2)에서 제공됩니다.</p>
      </div>
    );
  }
  return <Navigate to={`/spaces/${spaceId}/pages/${roots[0].id}`} replace />;
}
```

`src\features\wiki\pages\PageViewPage.tsx` (W1 자리표시 스텁 — 마크다운 렌더·Breadcrumbs·삭제는 W2):

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Spinner } from "@chanho/react";
import type { Page } from "../store/types";
import { getPage } from "../store/wikiStore";

export function PageViewPage() {
  const { pageId } = useParams();
  // undefined = 로딩 중, null = 없음
  const [page, setPage] = useState<Page | null | undefined>(undefined);

  useEffect(() => {
    if (!pageId) return;
    setPage(undefined);
    void getPage(pageId).then(setPage);
  }, [pageId]);

  if (page === undefined) {
    return <Spinner label="페이지 로딩 중" />;
  }
  if (page === null) {
    return <p>페이지를 찾을 수 없습니다</p>;
  }
  return (
    <article className="page-view">
      <h1>{page.title}</h1>
      <p className="page-view-stub">본문 렌더링은 W2에서 구현됩니다.</p>
    </article>
  );
}
```

- [ ] **Step 6: App.tsx 교체**

`src\app\App.tsx` 전체를 다음으로 교체:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Spinner } from "@chanho/react";
import type { Space } from "../features/wiki/store/types";
import { listSpaces } from "../features/wiki/store/wikiStore";
import { WikiLayout } from "../features/wiki/components/WikiLayout";
import { EmptySpaces } from "../features/wiki/components/EmptySpaces";
import { SpaceIndexPage } from "../features/wiki/pages/SpaceIndexPage";
import { PageViewPage } from "../features/wiki/pages/PageViewPage";

export function App() {
  const [spaces, setSpaces] = useState<Space[] | null>(null);

  const reload = useCallback(async () => {
    setSpaces(await listSpaces());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (spaces === null) {
    return (
      <div className="app-loading">
        <Spinner size="large" label="불러오는 중" />
      </div>
    );
  }

  if (spaces.length === 0) {
    return <EmptySpaces onCreated={reload} />;
  }

  return (
    <Routes>
      <Route
        path="/spaces/:spaceId"
        element={<WikiLayout spaces={spaces} onSpacesChanged={reload} />}
      >
        <Route index element={<SpaceIndexPage />} />
        <Route path="pages/:pageId" element={<PageViewPage />} />
      </Route>
      {/* "/" 포함 그 외 전부 → 첫 스페이스 (index가 첫 루트 페이지로 이어서 redirect) */}
      <Route path="*" element={<Navigate to={`/spaces/${spaces[0].id}`} replace />} />
    </Routes>
  );
}
```

- [ ] **Step 7: app.css 전체 교체**

`src\app\app.css` 전체를 다음으로 교체 (토큰 변수만 사용):

```css
body {
  margin: 0;
  font-family: var(--chanho-font-family-sans);
  color: var(--chanho-color-text-default);
  background: var(--chanho-color-background-default);
}

.wiki-layout {
  display: flex;
  min-height: 100vh;
}

.wiki-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-300);
  width: 260px;
  flex-shrink: 0;
  padding: var(--chanho-space-300) var(--chanho-space-200);
  background: var(--chanho-color-background-subtle);
  border-right: 1px solid var(--chanho-color-border-default);
}

.wiki-sidebar-brand {
  font-size: var(--chanho-font-size-400);
  font-weight: var(--chanho-font-weight-bold);
  color: var(--chanho-color-text-brand);
}

.wiki-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.wiki-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-height: 48px;
  padding: var(--chanho-space-100) var(--chanho-space-300);
  border-bottom: 1px solid var(--chanho-color-border-default);
}

.wiki-content {
  padding: var(--chanho-space-300);
}

.app-loading,
.empty-spaces,
.empty-pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--chanho-space-200);
}

.app-loading,
.empty-spaces {
  min-height: 100vh;
}

.empty-pages {
  padding: var(--chanho-space-600) 0;
}

.empty-spaces p,
.empty-pages p {
  margin: 0;
  color: var(--chanho-color-text-subtle);
}

.empty-pages h2 {
  margin: 0;
}

.space-create-form {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-200);
}

/* ── 페이지 트리 ────────────────────────────────────────── */

.page-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.page-tree-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 중첩 목록은 들여쓰기 */
.page-tree-list .page-tree-list {
  padding-left: var(--chanho-space-200);
}

.page-tree-row {
  display: flex;
  align-items: center;
  gap: var(--chanho-space-50);
}

.page-tree-toggle {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: var(--chanho-radius-medium);
  background: transparent;
  color: var(--chanho-color-text-subtle);
  font-size: var(--chanho-font-size-100);
  line-height: 1;
  cursor: pointer;
}

.page-tree-toggle:hover {
  background: var(--chanho-color-background-neutral-hovered);
}

.page-tree-toggle-spacer {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.page-tree-row a {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: var(--chanho-space-50) var(--chanho-space-100);
  border-radius: var(--chanho-radius-medium);
  color: var(--chanho-color-text-default);
  text-decoration: none;
  font-size: var(--chanho-font-size-200);
}

.page-tree-row a:hover {
  background: var(--chanho-color-background-neutral-hovered);
}

.page-tree-row a.active {
  background: var(--chanho-color-background-brand-subtle);
  color: var(--chanho-color-text-brand);
  font-weight: var(--chanho-font-weight-semibold);
}

.page-tree-empty {
  margin: 0;
  color: var(--chanho-color-text-subtle);
  font-size: var(--chanho-font-size-200);
}

/* ── 페이지 보기 스텁 (W1 — 본문 렌더는 W2) ────────────── */

.page-view h1 {
  margin: 0 0 var(--chanho-space-200);
  font-size: var(--chanho-font-size-400);
}

.page-view-stub {
  margin: 0;
  color: var(--chanho-color-text-subtle);
}
```

- [ ] **Step 8: GREEN 확인**

Run: `pnpm test src/app/App.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 9: 게이트 + 수동 스모크**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 통과 (테스트 총 43개: App 5 + spaces 8 + pages 12 + comments 5 + versions 13)
(선택) Run: `pnpm dev` 후 브라우저에서 `/` 접속 → `/spaces/sp1/pages/pg1`로 이동, 사이드바 트리 5개 항목·접기/펼치기·스페이스 스위처 동작 확인 후 종료

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat: W1 앱 셸 — WikiLayout/페이지 트리/라우팅/스페이스 생성 흐름" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## W1 완료 기준 (스펙 §6 W1 대비 체크)

- [ ] 스캐폴드: 지라 클론 설정 미러, tarball 소비, `pnpm typecheck/test/build` 게이트 동작 (Task 1)
- [ ] wikiStore 13함수 전부 — 스펙 §5 시그니처 그대로 (Task 2·3)
- [ ] 시드: 스페이스 1(DEV) + 루트 2 + 하위 2 + 손자 1 + 버전(pg1은 2개) + 코멘트 2 + 목업 유저 4명 (Task 2)
- [ ] 스토어 필수 테스트(스펙 §7): 키 중복 거부 ✓(T2) / 손상 시드 재생성 ✓(T2) / 삭제 거부 ✓(T3) / 삭제 연쇄 ✓(T3) / 버전 스냅샷 실변경만 ✓(T3) / no-op ✓(T3) / 복원 새 버전 ✓(T3)
- [ ] WikiLayout(스위처+트리+Avatar) / 접이식 PageTree(NavLink 하이라이트) / 라우팅(`/spaces/:spaceId/pages/:pageId` + catch-all redirect) / SpaceCreateModal / EmptyState 2종 (Task 4)
- [ ] RTL 핵심 흐름 4+1: 트리 계층(깊이 3) / 접기·펼치기 / 클릭 네비게이션 / 스페이스 생성 / 스페이스 0개 EmptyState (Task 4)
- [ ] push 없음 — 컨트롤러가 수행
