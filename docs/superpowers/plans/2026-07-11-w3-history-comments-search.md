# W3: 버전 히스토리·코멘트·사이드바 검색 구현 계획 (MVP 마감)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 버전 히스토리(HistoryModal + 복원), 페이지 하단 코멘트(CommentSection), 사이드바 제목 검색(조상 체인 유지 필터)을 완성하고 README로 MVP를 마감한다.

**Architecture:** 세 기능 모두 W1 wikiStore의 기존 API(listVersions/restoreVersion/listComments/addComment)를 소비만 한다 — 스토어 수정 없음. HistoryModal·CommentSection은 PageViewPage의 자식 컴포넌트, 검색은 WikiLayout의 로컬 state + 순수함수 `filterPagesWithAncestors`로 트리 입력을 필터한다. W2 최종리뷰 이월 2건(편집 화면 스페이스 불일치 가드, ancestorsOf 순환 가드)도 이번 웨이브에서 정리한다.

**Tech Stack:** Vite 7 + React 19 + TypeScript(strict) + react-router 7 + @chanho/react·tokens(tarball) + react-markdown + remark-gfm + Vitest/Testing Library

**기준 상태:** HEAD `2c38eed` (W2 완료, 61 tests 그린). 작업 디렉터리 `C:\MSA_TEMPLATE\wiki-front`.

## Global Constraints

- **UI는 100% 디자인 시스템** — "MUI 등 타 UI 라이브러리 금지 — UI는 100% 디자인 시스템" (스펙 §2.1). **이번 웨이브에서 새 패키지 설치 금지** — 필요한 것은 전부 기존에 있다
- **화면은 `wikiStore.ts`의 async 함수만 호출한다** (스펙 §2.3-1). **스토어는 이번 웨이브에서 수정하지 않는다** — 13개 함수가 W1에서 완성됐다
- **에러는 한국어 메시지로 throw, 화면은 Toast(danger)로 표시** (스펙 §2.3-4)
- **스타일은 앱 로컬 CSS(`src/app/app.css`), `--chanho-*` 토큰 변수만 사용** (스펙 §4)
- **HistoryModal 규칙** (스펙 §4): "버전 목록(vN, 저장자, 시각 — 최신순) → 선택 시 그 버전 본문 MarkdownView 미리보기 + '이 버전으로 복원' Button(복원 후 모달 닫고 보기 화면 갱신 + Toast)"
- **사이드바 검색은 제목 필터만** — "전문(full-text) 검색 — 사이드바 검색은 제목 필터만" (스펙 §1 범위 제외)
- **TDD** — 실패 테스트를 먼저 쓰고 RED를 실제로 관찰한 뒤 구현한다
- **게이트: `pnpm typecheck` && `pnpm test` && `pnpm build` 전부 통과 후에만 커밋** (스펙 §7)
- **git: main 브랜치 직접 커밋, 커밋 메시지 한국어, push는 하지 않는다** (컨트롤러가 수행)
- **이 웨이브로 MVP 마감** — 마지막 태스크에 README.md 작성 포함

## 파일 구조 (W3에서 만지는 것)

```
src/
├── app/
│   ├── App.w2-view.test.tsx        # 수정: "히스토리 버튼 없음" 단언 → 있음으로 반전 (Task 1)
│   ├── App.w3-history.test.tsx     # 생성: 이월 정리 2건 + 히스토리/복원 RTL (Task 1)
│   ├── App.w3-comments.test.tsx    # 생성: 코멘트 목록·작성·빈 본문 RTL (Task 2)
│   ├── App.w3-search.test.tsx      # 생성: 검색 필터·펼침·원상복귀 RTL (Task 3)
│   └── app.css                     # 수정: 히스토리 모달(T1), 코멘트(T2) 스타일
├── features/wiki/
│   ├── pages/
│   │   ├── PageViewPage.tsx        # 수정: 히스토리 버튼+순환 가드(T1), CommentSection(T2)
│   │   └── PageEditPage.tsx        # 수정: 스페이스 불일치 가드 (Task 1)
│   └── components/
│       ├── HistoryModal.tsx        # 생성 (Task 1)
│       ├── CommentSection.tsx      # 생성 (Task 2)
│       ├── filterPagesWithAncestors.ts       # 생성: 순수 필터 함수 (Task 3)
│       ├── filterPagesWithAncestors.test.ts  # 생성: 단위 테스트 (Task 3)
│       ├── WikiLayout.tsx          # 수정: 검색 TextField + 필터 적용 (Task 3)
│       └── PageTree.tsx            # 수정: forceExpand prop (Task 3)
README.md                           # 생성: MVP 마감 문서 (Task 3)
```

**디자인 시스템 API (소스 확인 완료 — 추측 아님):**
- `Modal({ trigger: ReactElement(필수), title, description?, open?, onOpenChange?, className? })` — trigger는 `RadixDialog.Trigger asChild`로 감싸져 클릭 시 모달을 연다(SpaceCreateModal과 동일 패턴). title이 dialog의 접근 가능 이름. className은 콘텐츠 패널(`role="dialog"`)에 병합. 기본 패널 폭 `min(480px, calc(100vw - 32px))`
- `Button({ variant?: "primary"|"subtle"|"danger", size?: "medium"|"small", type="button", ... })`
- `TextField({ label, description?, error?, ...input props })` — label이 input과 자동 연결 → `getByLabelText` 가능
- `TextArea({ label, description?, error?, ...textarea props })` — TextField와 동일 패턴
- `Avatar({ name, src?, size? })` — src 없으면 이니셜 텍스트(`role="img"` + `aria-label={name}`). 한 단어 이름("이서연")의 이니셜은 첫 글자("이")뿐이므로 `getByText("이서연")`은 이름 `<strong>`만 매치한다
- `useToast()` → `toast({ title, description?, appearance?: "info"|"success"|"danger" })`
- 토큰: `--chanho-color-border-focused`·`--chanho-color-background-brand-subtle` 존재 확인(선택 하이라이트용). `border-brand`/`background-selected`는 **존재하지 않는다** — 쓰지 말 것

**시드 실데이터 (`src/mock/seed.ts` — 테스트 단언은 여기 맞춘다):**
- pg1 "시작하기": 버전 2개 — `pv1`(v1, savedBy u1 김찬호, savedAt `2026-07-10T09:00:00.000Z`, body = `"# 개발 위키\n\n초기 안내 문서입니다."`) / `pv2`(v2, savedBy u2 이서연, savedAt `2026-07-10T10:00:00.000Z`, body = 현재 본문 `PG1_BODY`, h1 "개발 위키에 오신 것을 환영합니다")
- pg1 코멘트 2개(오름차순): `c1`(u2 이서연, "온보딩에 딱 필요한 내용이네요.") → `c2`(u3 박준영, "배포 가이드 링크도 추가하면 좋겠습니다.")
- 트리: pg1 "시작하기"(루트) ─ pg3 "개발 환경 설정" ─ pg5 "로컬 DB 설정" / pg1 ─ pg4 "배포 가이드" / pg2 "팀 규칙"(루트) → 검색어 "설정"의 매치는 pg3·pg5, 조상 체인은 pg1(+pg3)
- 현재 유저 `u1` 김찬호 (`CURRENT_USER_ID`)

**스토어 계약 중 W3가 기대는 것 (수정 금지, 소비만):**
- `listVersions(pageId): Promise<PageVersion[]>` — version **내림차순(최신 먼저)**
- `restoreVersion(pageId, versionId): Promise<Page>` — updatePage 경로 재사용. **현재와 동일 내용이면 no-op**(버전 안 쌓임, 반환 Page의 updatedAt 불변) — `wikiStore.versions.test.ts`가 이미 검증
- `listComments(pageId): Promise<Comment[]>` — createdAt 오름차순
- `addComment(pageId, body): Promise<Comment>` — 빈 본문(trim 후) `"코멘트 내용을 입력하세요"` throw

---

### Task 1: W2 이월 정리 2건 + HistoryModal(복원·no-op 분기)

**Files:**
- Modify: `src/features/wiki/pages/PageEditPage.tsx` (스페이스 불일치 가드)
- Modify: `src/features/wiki/pages/PageViewPage.tsx` (ancestorsOf 순환 가드 → 히스토리 버튼 연결)
- Create: `src/features/wiki/components/HistoryModal.tsx`
- Create: `src/app/App.w3-history.test.tsx`
- Modify: `src/app/App.w2-view.test.tsx:36-37` ("히스토리 버튼 없음" 단언 반전)
- Modify: `src/app/app.css` (히스토리 모달 스타일)

**Interfaces:**
- Consumes: 스토어 `listVersions(pageId)`, `restoreVersion(pageId, versionId)`. `WikiOutletContext { pages, space, reloadPages }`(WikiLayout), `MarkdownView({ markdown: string })`, `renderApp(initialPath?)` 하네스(`src/app/testUtils.tsx`)
- Produces:
  - `HistoryModal` 컴포넌트 — 이후 태스크는 사용하지 않지만 PageViewPage가 소비:
    ```ts
    export interface HistoryModalProps {
      /** 현재 보고 있는 페이지 — no-op 판정(updatedAt 비교) 기준 */
      page: Page;
      /** 저장자 이름 표시용 — PageViewPage가 이미 로드한 목록 재사용 */
      users: User[];
      /** 복원 후 반환 Page 전달 — 부모가 setPage + reloadPages 수행 */
      onRestored: (page: Page) => void | Promise<void>;
    }
    ```
  - PageViewPage 우상단 액션에 접근 가능 이름 `"히스토리"` Button (Task 2가 이 파일을 이어서 수정한다 — Step 10의 전체 코드가 Task 2의 기준)
  - no-op 판정 방식: `restoreVersion` 반환 Page의 `updatedAt`이 복원 전(`page.updatedAt`)과 같으면 스토어가 no-op이었다고 판정 → Toast `"현재 내용과 동일합니다 — 변경 없음"`(info) 분기. 실변경이면 `"v{N} 버전으로 복원했습니다"`(success). 두 경우 모두 모달은 닫는다

- [ ] **Step 1: 이월 정리 2건 실패 테스트 작성**

Create `src/app/App.w3-history.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { MOCK_USERS } from "../mock/users";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W3 이월 정리", () => {
  it("편집 URL의 spaceId가 페이지 소속과 다르면 올바른 스페이스의 편집 URL로 redirect한다", async () => {
    const T = "2026-07-01T00:00:00.000Z";
    localStorage.setItem(
      "wiki.v1",
      JSON.stringify({
        users: MOCK_USERS,
        spaces: [
          { id: "sp1", key: "DEV", name: "개발 위키", createdAt: T },
          { id: "sp2", key: "OPS", name: "운영 위키", createdAt: T },
        ],
        pages: [
          {
            id: "pgA", spaceId: "sp2", parentId: null, title: "운영 문서", body: "# 운영",
            position: 1, createdBy: "u1", updatedBy: "u1", createdAt: T, updatedAt: T,
          },
        ],
        versions: [],
        comments: [],
      }),
    );
    renderApp("/spaces/sp1/pages/pgA/edit"); // sp2 소속 페이지의 편집을 sp1 URL로 접근
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp2/pages/pgA/edit");
    });
    expect(await screen.findByLabelText("제목")).toHaveValue("운영 문서");
  });

  it("순환 parentId 데이터에서도 페이지 보기가 멈추지 않고 렌더된다 (ancestorsOf 방어)", async () => {
    const T = "2026-07-01T00:00:00.000Z";
    const base = {
      spaceId: "sp1", body: "본문", position: 1,
      createdBy: "u1", updatedBy: "u1", createdAt: T, updatedAt: T,
    };
    localStorage.setItem(
      "wiki.v1",
      JSON.stringify({
        users: MOCK_USERS,
        spaces: [{ id: "sp1", key: "DEV", name: "개발 위키", createdAt: T }],
        pages: [
          { ...base, id: "pgA", parentId: "pgB", title: "순환 A" },
          { ...base, id: "pgB", parentId: "pgA", title: "순환 B", position: 2 },
        ],
        versions: [],
        comments: [],
      }),
    );
    renderApp("/spaces/sp1/pages/pgA");
    // 가드가 없으면 ancestorsOf가 무한 루프에 빠져 이 시점에 도달하지 못한다
    expect(await screen.findByRole("heading", { level: 1, name: "순환 A" })).toBeInTheDocument();
    // 조상 체인은 순환을 만나기 전(pgB)까지만 브레드크럼에 나타난다
    const crumbs = screen.getByRole("navigation", { name: "브레드크럼" });
    expect(within(crumbs).getByRole("link", { name: "순환 B" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test src/app/App.w3-history.test.tsx`
Expected:
- 편집 redirect 테스트 FAIL — 현재 PageEditPage에 가드가 없어 URL이 `/spaces/sp1/pages/pgA/edit`에 머문다
- 순환 테스트는 **동기 무한 루프로 테스트 실행이 멈춘다** (출력이 몇 초간 정지하고 메모리가 계속 증가) — 이것이 RED다. 멈춤을 관찰했으면 `Ctrl+C`로 중단하고 다음 단계로 간다

- [ ] **Step 3: PageEditPage 스페이스 불일치 가드 구현**

`src/features/wiki/pages/PageEditPage.tsx`에 3군데 수정.

(1) state 선언부 — `const [notFound, setNotFound] = useState(false);` 바로 아래에 추가:

```tsx
  // 수정 모드에서 로드한 페이지의 실제 spaceId (URL 불일치 가드용)
  const [pageSpaceId, setPageSpaceId] = useState<string | null>(null);
```

(2) 로드 effect의 else 분기 — 아래처럼 `setPageSpaceId` 한 줄 추가:

```tsx
      if (page === null) {
        setNotFound(true);
      } else {
        setTitle(page.title);
        setBody(page.body);
        setPageSpaceId(page.spaceId);
      }
```

(3) `if (notFound) { ... }` 블록 바로 아래에 가드 추가:

```tsx
  if (isEdit && pageId && pageSpaceId !== null && pageSpaceId !== spaceId) {
    // 잘못된 스페이스 URL — 페이지가 속한 스페이스의 편집 URL로 redirect (PageViewPage와 동일 패턴)
    return <Navigate to={`/spaces/${pageSpaceId}/pages/${pageId}/edit`} replace />;
  }
```

(`Navigate`는 이미 import되어 있다.)

- [ ] **Step 4: ancestorsOf 순환 가드 구현**

`src/features/wiki/pages/PageViewPage.tsx`의 `ancestorsOf` 함수를 통째로 교체:

```tsx
/** parentId 체인을 따라 조상 페이지를 루트→직계 부모 순서로 반환. 순환 데이터 방어(방문 집합). */
function ancestorsOf(page: Page, pages: Page[]): Page[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const chain: Page[] = [];
  const visited = new Set<string>([page.id]);
  let parentId = page.parentId;
  while (parentId !== null) {
    if (visited.has(parentId)) break; // 순환 — 무한 루프 방지
    const parent = byId.get(parentId);
    if (!parent) break;
    visited.add(parentId);
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}
```

- [ ] **Step 5: GREEN 확인**

Run: `pnpm test src/app/App.w3-history.test.tsx`
Expected: 2개 전부 PASS (순환 테스트도 즉시 끝난다).

Run: `pnpm test`
Expected: 기존 61개 포함 전부 PASS (기존 테스트 무회귀).

- [ ] **Step 6: 게이트 후 커밋 (이월 정리)**

Run: `pnpm typecheck` → `pnpm test` → `pnpm build` (전부 통과 확인)

```bash
git add src/features/wiki/pages/PageEditPage.tsx src/features/wiki/pages/PageViewPage.tsx src/app/App.w3-history.test.tsx
git commit -m "fix: W2 이월 정리 — 편집 화면 스페이스 불일치 redirect·ancestorsOf 순환 가드"
```

- [ ] **Step 7: 히스토리/복원 실패 테스트 작성**

(1) `src/app/App.w2-view.test.tsx`의 첫 테스트 끝부분에서 아래 2줄을:

```tsx
    // W3 범위가 섞이지 않았는지 — 히스토리/코멘트 UI 없음
    expect(screen.queryByRole("button", { name: "히스토리" })).not.toBeInTheDocument();
```

아래로 교체 (W3에서 히스토리 버튼이 생기므로 단언을 반전):

```tsx
    // 우상단 액션 — 히스토리 버튼 (W3에서 추가됨)
    expect(screen.getByRole("button", { name: "히스토리" })).toBeInTheDocument();
```

(2) `src/app/App.w3-history.test.tsx` 파일 끝(기존 describe 블록 뒤)에 추가:

```tsx
describe("W3 버전 히스토리", () => {
  it("히스토리 모달에서 버전 목록(최신순)을 보고 v1을 선택하면 미리보기가 렌더된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    const dialog = await screen.findByRole("dialog", { name: "버전 히스토리" });
    // 버전 목록 최신순 — v2(이서연)가 먼저, v1(김찬호)이 나중
    const items = within(dialog).getAllByRole("button", { name: /^v\d/ });
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("v2");
    expect(items[0]).toHaveTextContent("이서연");
    expect(items[1]).toHaveTextContent("v1");
    expect(items[1]).toHaveTextContent("김찬호");
    // 기본 선택 = 최신(v2) → 현재 본문이 미리보기에 렌더
    expect(
      within(dialog).getByRole("heading", { name: "개발 위키에 오신 것을 환영합니다" }),
    ).toBeInTheDocument();
    // v1 선택 → v1 본문(제목 h2 + 마크다운)으로 미리보기 교체
    await user.click(items[1]);
    expect(within(dialog).getByRole("heading", { name: "개발 위키" })).toBeInTheDocument();
    expect(within(dialog).getByText("초기 안내 문서입니다.")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("heading", { name: "개발 위키에 오신 것을 환영합니다" }),
    ).not.toBeInTheDocument();
  });

  it("v1을 복원하면 모달이 닫히고 본문이 갱신되며 복원도 새 버전(v3)으로 쌓인다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    const dialog = await screen.findByRole("dialog", { name: "버전 히스토리" });
    await user.click(within(dialog).getByRole("button", { name: /^v1/ }));
    await user.click(within(dialog).getByRole("button", { name: "이 버전으로 복원" }));
    // 모달 닫힘 + 성공 Toast
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("v1 버전으로 복원했습니다")).toBeInTheDocument();
    // 보기 화면 본문이 v1 내용으로 갱신 (setPage — 재조회 없이 즉시)
    expect(screen.getByRole("heading", { name: "개발 위키" })).toBeInTheDocument();
    expect(screen.getByText("초기 안내 문서입니다.")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "개발 위키에 오신 것을 환영합니다" }),
    ).not.toBeInTheDocument();
    // 히스토리가 끊기지 않는다 — 다시 열면 복원 결과가 v3(최신)
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    const reopened = await screen.findByRole("dialog", { name: "버전 히스토리" });
    const reopenedItems = within(reopened).getAllByRole("button", { name: /^v\d/ });
    expect(reopenedItems).toHaveLength(3);
    expect(reopenedItems[0]).toHaveTextContent("v3");
  });

  it("현재와 동일한 버전(v2)을 복원하면 '변경 없음' 정보 Toast가 뜨고 버전이 쌓이지 않는다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    const dialog = await screen.findByRole("dialog", { name: "버전 히스토리" });
    // 기본 선택이 이미 v2(최신 = 현재 내용) — 그대로 복원 시도
    await user.click(within(dialog).getByRole("button", { name: "이 버전으로 복원" }));
    expect(await screen.findByText("현재 내용과 동일합니다 — 변경 없음")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // 버전이 쌓이지 않았다 — 다시 열어도 v2·v1 그대로
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    const reopened = await screen.findByRole("dialog", { name: "버전 히스토리" });
    expect(within(reopened).getAllByRole("button", { name: /^v\d/ })).toHaveLength(2);
  });
});
```

- [ ] **Step 8: RED 확인**

Run: `pnpm test src/app/App.w3-history.test.tsx src/app/App.w2-view.test.tsx`
Expected: W3 히스토리 3개 + 반전한 W2 단언 1개 FAIL — 히스토리 버튼이 아직 없다. W3 이월 정리 2개와 나머지 W2 테스트는 PASS.

- [ ] **Step 9: HistoryModal 구현**

Create `src/features/wiki/components/HistoryModal.tsx`:

```tsx
import { useState } from "react";
import { Button, Modal, Spinner, useToast } from "@chanho/react";
import type { Page, PageVersion, User } from "../store/types";
import { listVersions, restoreVersion } from "../store/wikiStore";
import { MarkdownView } from "./MarkdownView";

export interface HistoryModalProps {
  /** 현재 보고 있는 페이지 — no-op 판정(updatedAt 비교) 기준 */
  page: Page;
  /** 저장자 이름 표시용 — PageViewPage가 이미 로드한 목록 재사용 */
  users: User[];
  /** 복원 후 반환 Page 전달 — 부모가 setPage + reloadPages 수행 */
  onRestored: (page: Page) => void | Promise<void>;
}

/** 저장 시각 표기: ko-KR 날짜+시간 (예: "2026. 7. 10. 오후 7:00:00") */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR");
}

/**
 * 버전 히스토리 모달 — 좌측 버전 목록(최신순, 선택 하이라이트) + 우측 선택 버전 미리보기 + 복원.
 * 트리거는 우상단 "히스토리" Button (Modal trigger prop — URL 쿼리 아님).
 */
export function HistoryModal({ page, users, onRestored }: HistoryModalProps) {
  const [open, setOpen] = useState(false);
  // null = 로딩 중 — 모달이 열릴 때마다 재조회한다
  const [versions, setVersions] = useState<PageVersion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const toast = useToast();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setVersions(null);
      void listVersions(page.id).then((list) => {
        setVersions(list); // 스토어가 version 내림차순(최신 먼저) 보장
        setSelectedId(list[0]?.id ?? null); // 최신 버전 기본 선택
      });
    }
  };

  const selected = versions?.find((v) => v.id === selectedId) ?? null;
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "알 수 없음";

  const handleRestore = async () => {
    if (!selected) return;
    try {
      const restored = await restoreVersion(page.id, selected.id);
      // no-op 판정: 반환 Page의 updatedAt이 복원 전과 같으면 스토어가 버전을 쌓지 않았다
      if (restored.updatedAt === page.updatedAt) {
        toast({ title: "현재 내용과 동일합니다 — 변경 없음", appearance: "info" });
      } else {
        toast({ title: `v${selected.version} 버전으로 복원했습니다`, appearance: "success" });
      }
      await onRestored(restored); // no-op이어도 무해 — 반환 Page가 현재와 동일
      setOpen(false);
    } catch (error) {
      toast({
        title: "복원 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <Modal
      trigger={
        <Button variant="subtle" size="small">
          히스토리
        </Button>
      }
      title="버전 히스토리"
      open={open}
      onOpenChange={handleOpenChange}
      className="history-modal"
    >
      {versions === null ? (
        <Spinner label="버전 로딩 중" />
      ) : (
        <div className="history-body">
          <ul className="history-list">
            {versions.map((version) => (
              <li key={version.id}>
                <button
                  type="button"
                  className="history-item"
                  aria-pressed={version.id === selectedId}
                  onClick={() => setSelectedId(version.id)}
                >
                  <strong>v{version.version}</strong>
                  <span className="history-item-meta">
                    {userName(version.savedBy)} · {formatDateTime(version.savedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <div className="history-preview">
              <h2>{selected.title}</h2>
              <MarkdownView markdown={selected.body} />
              <Button onClick={handleRestore}>이 버전으로 복원</Button>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 10: PageViewPage에 히스토리 버튼 연결**

`src/features/wiki/pages/PageViewPage.tsx` 전체를 아래로 교체 (Step 4의 순환 가드 포함 — Task 2가 이 코드를 기준으로 이어서 수정한다):

```tsx
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useOutletContext, useParams } from "react-router";
import { Avatar, Button, Spinner, useToast } from "@chanho/react";
import type { Page, User } from "../store/types";
import { deletePage, getPage, listUsers } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/WikiLayout";
import { MarkdownView } from "../components/MarkdownView";
import { HistoryModal } from "../components/HistoryModal";

/** 수정일 표기: 2026-07-10T10:00:00.000Z → "2026년 7월 10일" */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** parentId 체인을 따라 조상 페이지를 루트→직계 부모 순서로 반환. 순환 데이터 방어(방문 집합). */
function ancestorsOf(page: Page, pages: Page[]): Page[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const chain: Page[] = [];
  const visited = new Set<string>([page.id]);
  let parentId = page.parentId;
  while (parentId !== null) {
    if (visited.has(parentId)) break; // 순환 — 무한 루프 방지
    const parent = byId.get(parentId);
    if (!parent) break;
    visited.add(parentId);
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}

export function PageViewPage() {
  const { spaceId, pageId } = useParams();
  const { pages, space, reloadPages } = useOutletContext<WikiOutletContext>();
  const navigate = useNavigate();
  const toast = useToast();
  // undefined = 로딩 중, null = 없음
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);

  useEffect(() => {
    if (!pageId) return;
    setPage(undefined);
    void getPage(pageId).then(setPage);
  }, [pageId]);

  if (page === undefined || pages === null) {
    return <Spinner label="페이지 로딩 중" />;
  }
  if (page === null) {
    return <p>페이지를 찾을 수 없습니다</p>;
  }
  if (page.spaceId !== spaceId) {
    // 잘못된 스페이스 URL — 페이지가 속한 스페이스로 redirect (W1 최종리뷰 인계 ①)
    return <Navigate to={`/spaces/${page.spaceId}/pages/${page.id}`} replace />;
  }

  const ancestors = ancestorsOf(page, pages);
  const editor = users.find((u) => u.id === page.updatedBy);

  const handleDelete = async () => {
    try {
      await deletePage(page.id);
      toast({ title: `"${page.title}" 페이지를 삭제했습니다`, appearance: "success" });
      await reloadPages();
      navigate(
        page.parentId ? `/spaces/${space.id}/pages/${page.parentId}` : `/spaces/${space.id}`,
      );
    } catch (error) {
      toast({
        title: "삭제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <article className="page-view">
      <div className="page-view-top">
        <nav className="page-breadcrumbs" aria-label="브레드크럼">
          <ol>
            <li>
              <Link to={`/spaces/${space.id}`}>{space.name}</Link>
            </li>
            {ancestors.map((ancestor) => (
              <li key={ancestor.id}>
                <Link to={`/spaces/${space.id}/pages/${ancestor.id}`}>{ancestor.title}</Link>
              </li>
            ))}
            <li aria-current="page">{page.title}</li>
          </ol>
        </nav>
        <div className="page-view-actions">
          <Link className="page-view-edit-link" to={`/spaces/${space.id}/pages/${page.id}/edit`}>
            편집
          </Link>
          <HistoryModal
            page={page}
            users={users}
            onRestored={async (restored) => {
              setPage(restored); // 재조회 없이 반환 Page로 즉시 갱신
              await reloadPages(); // 제목이 복원된 경우 사이드바 트리 반영
            }}
          />
          <Button variant="danger" size="small" onClick={handleDelete}>
            삭제
          </Button>
        </div>
      </div>
      <h1>{page.title}</h1>
      <div className="page-view-meta">
        {editor ? (
          <>
            <Avatar name={editor.name} size="small" />
            <span>{editor.name}</span>
          </>
        ) : null}
        <span>{formatDate(page.updatedAt)} 수정</span>
      </div>
      <MarkdownView markdown={page.body} />
    </article>
  );
}
```

- [ ] **Step 11: 히스토리 모달 CSS**

`src/app/app.css` 맨 끝에 추가:

```css
/* ── 버전 히스토리 모달 (W3) ──────────────────────────── */

/* Modal 기본 패널 폭(480px)을 넓힌다 — 속성 선택자로 특이도를 올려 로드 순서와 무관하게 이긴다 */
.history-modal[role="dialog"] {
  width: min(880px, calc(100vw - 32px));
}

.history-body {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: var(--chanho-space-300);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-50);
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 60vh;
  overflow-y: auto;
}

.history-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--chanho-space-25);
  width: 100%;
  padding: var(--chanho-space-100) var(--chanho-space-150);
  border: 1px solid var(--chanho-color-border-default);
  border-radius: var(--chanho-radius-medium);
  background: transparent;
  font-size: var(--chanho-font-size-200);
  color: var(--chanho-color-text-default);
  text-align: left;
  cursor: pointer;
}

.history-item:hover {
  background: var(--chanho-color-background-neutral);
}

.history-item[aria-pressed="true"] {
  border-color: var(--chanho-color-border-focused);
  background: var(--chanho-color-background-brand-subtle);
}

.history-item-meta {
  color: var(--chanho-color-text-subtle);
}

.history-preview {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--chanho-space-200);
  max-height: 60vh;
  overflow-y: auto;
}

.history-preview h2 {
  margin: 0;
  font-size: var(--chanho-font-size-400);
  line-height: var(--chanho-font-lineHeight-400);
}
```

- [ ] **Step 12: GREEN 확인**

Run: `pnpm test src/app/App.w3-history.test.tsx src/app/App.w2-view.test.tsx`
Expected: 전부 PASS (히스토리 3개 + 이월 2개 + W2 5개).

Run: `pnpm test`
Expected: 전부 PASS.

- [ ] **Step 13: 게이트 후 커밋 (히스토리)**

Run: `pnpm typecheck` → `pnpm test` → `pnpm build` (전부 통과 확인)

```bash
git add src/features/wiki/components/HistoryModal.tsx src/features/wiki/pages/PageViewPage.tsx src/app/App.w3-history.test.tsx src/app/App.w2-view.test.tsx src/app/app.css
git commit -m "feat: HistoryModal — 버전 목록·미리보기·복원과 변경 없음(no-op) 분기"
```

---

### Task 2: CommentSection — 페이지 하단 코멘트 목록·작성

**Files:**
- Create: `src/features/wiki/components/CommentSection.tsx`
- Modify: `src/features/wiki/pages/PageViewPage.tsx` (하단에 CommentSection 배치 — Task 1 Step 10 코드 기준)
- Create: `src/app/App.w3-comments.test.tsx`
- Modify: `src/app/app.css` (코멘트 스타일)

**Interfaces:**
- Consumes: 스토어 `listComments(pageId): Promise<Comment[]>`(오름차순), `addComment(pageId, body): Promise<Comment>`(빈 본문 `"코멘트 내용을 입력하세요"` throw). `renderApp` 하네스. alm-front `IssueDetailModal.tsx` 코멘트 탭이 미러 원본 — 단 Tabs 없이 섹션 직접 배치
- Produces:
  - `CommentSection` 컴포넌트:
    ```ts
    export interface CommentSectionProps {
      pageId: string;
      /** 작성자 이름 표시용 — PageViewPage가 이미 로드한 목록 재사용 */
      users: User[];
    }
    ```
  - 접근성 표면: `role="region"` 이름 `"코멘트"`(section aria-label), 헤딩 `"코멘트 (N)"`, TextArea 라벨 `"코멘트 작성"`(섹션 이름 "코멘트"와 라벨 충돌 방지), 제출 Button `"코멘트 남기기"`, 본문 `data-testid="comment-body"`

- [ ] **Step 1: 코멘트 실패 테스트 작성**

Create `src/app/App.w3-comments.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W3 코멘트", () => {
  it("시드 코멘트 2개가 오름차순으로 보이고, 작성하면 목록 끝에 반영된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    const region = await screen.findByRole("region", { name: "코멘트" });
    expect(within(region).getByRole("heading", { name: "코멘트 (2)" })).toBeInTheDocument();
    // 오름차순: c1(이서연, 11:00) → c2(박준영, 11:30)
    expect(
      within(region).getAllByTestId("comment-body").map((el) => el.textContent),
    ).toEqual(["온보딩에 딱 필요한 내용이네요.", "배포 가이드 링크도 추가하면 좋겠습니다."]);
    expect(within(region).getByText("이서연")).toBeInTheDocument();
    expect(within(region).getByText("박준영")).toBeInTheDocument();
    // 작성 → 목록 끝에 추가 (현재 유저 u1 김찬호)
    await user.type(within(region).getByLabelText("코멘트 작성"), "복원 기능도 확인했습니다");
    await user.click(within(region).getByRole("button", { name: "코멘트 남기기" }));
    expect(await within(region).findByText("복원 기능도 확인했습니다")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (3)" })).toBeInTheDocument();
    expect(
      within(region).getAllByTestId("comment-body").map((el) => el.textContent),
    ).toEqual([
      "온보딩에 딱 필요한 내용이네요.",
      "배포 가이드 링크도 추가하면 좋겠습니다.",
      "복원 기능도 확인했습니다",
    ]);
    expect(within(region).getByText("김찬호")).toBeInTheDocument();
    // 입력창은 비워진다
    expect(within(region).getByLabelText("코멘트 작성")).toHaveValue("");
  });

  it("빈 코멘트를 제출하면 danger Toast가 뜨고 목록은 그대로다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    const region = await screen.findByRole("region", { name: "코멘트" });
    await user.click(within(region).getByRole("button", { name: "코멘트 남기기" }));
    expect(await screen.findByText("코멘트 작성 실패")).toBeInTheDocument();
    expect(screen.getByText("코멘트 내용을 입력하세요")).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "코멘트 (2)" })).toBeInTheDocument();
    expect(within(region).getAllByTestId("comment-body")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test src/app/App.w3-comments.test.tsx`
Expected: 2개 전부 FAIL — `role="region"` 이름 "코멘트"인 요소가 아직 없다.

- [ ] **Step 3: CommentSection 구현**

Create `src/features/wiki/components/CommentSection.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Avatar, Button, Spinner, TextArea, useToast } from "@chanho/react";
import type { Comment, User } from "../store/types";
import { addComment, listComments } from "../store/wikiStore";

export interface CommentSectionProps {
  pageId: string;
  /** 작성자 이름 표시용 — PageViewPage가 이미 로드한 목록 재사용 */
  users: User[];
}

/** 코멘트 시각 표기: ko-KR 날짜+시간 */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR");
}

/** 페이지 하단 코멘트 — 목록(오름차순) + 작성. alm-front IssueDetailModal 코멘트 탭 미러(Tabs 없이 직접 배치). */
export function CommentSection({ pageId, users }: CommentSectionProps) {
  // null = 로딩 중
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const toast = useToast();

  useEffect(() => {
    setComments(null);
    void listComments(pageId).then(setComments);
  }, [pageId]);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "알 수 없음";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await addComment(pageId, draft); // 빈 본문은 스토어가 throw
      setDraft("");
      setComments(await listComments(pageId)); // 작성 후 목록 재조회
      toast({ title: "코멘트를 남겼습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "코멘트 작성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  if (comments === null) {
    return <Spinner size="small" label="코멘트 로딩 중" />;
  }

  return (
    <section className="comment-section" aria-label="코멘트">
      <h2 className="comment-section-title">코멘트 ({comments.length})</h2>
      {comments.map((comment) => (
        <div key={comment.id} className="comment-item">
          <Avatar name={userName(comment.authorId)} size="small" />
          <div>
            <p className="comment-meta">
              <strong>{userName(comment.authorId)}</strong> · {formatDateTime(comment.createdAt)}
            </p>
            <p className="comment-body" data-testid="comment-body">
              {comment.body}
            </p>
          </div>
        </div>
      ))}
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

- [ ] **Step 4: PageViewPage 하단에 배치**

`src/features/wiki/pages/PageViewPage.tsx`에 2군데 수정 (Task 1 Step 10 코드 기준).

(1) import 블록 — `import { HistoryModal } from "../components/HistoryModal";` 아래에 추가:

```tsx
import { CommentSection } from "../components/CommentSection";
```

(2) JSX 끝부분 — `<MarkdownView markdown={page.body} />` 바로 아래(`</article>` 닫기 전)에 추가:

```tsx
      <CommentSection pageId={page.id} users={users} />
```

- [ ] **Step 5: 코멘트 CSS**

`src/app/app.css` 맨 끝에 추가:

```css
/* ── 코멘트 (W3) ──────────────────────────────────────── */

.comment-section {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-200);
  max-width: 880px;
  margin-top: var(--chanho-space-500);
  padding-top: var(--chanho-space-300);
  border-top: 1px solid var(--chanho-color-border-default);
}

.comment-section-title {
  margin: 0;
  font-size: var(--chanho-font-size-400);
  line-height: var(--chanho-font-lineHeight-400);
}

.comment-item {
  display: flex;
  align-items: flex-start;
  gap: var(--chanho-space-100);
}

.comment-meta {
  margin: 0 0 var(--chanho-space-25);
  font-size: var(--chanho-font-size-200);
  color: var(--chanho-color-text-subtle);
}

.comment-meta strong {
  color: var(--chanho-color-text-default);
}

.comment-body {
  margin: 0;
  white-space: pre-wrap;
}

.comment-empty {
  margin: 0;
  color: var(--chanho-color-text-subtle);
}

.comment-form {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--chanho-space-100);
}
```

- [ ] **Step 6: GREEN 확인**

Run: `pnpm test src/app/App.w3-comments.test.tsx`
Expected: 2개 전부 PASS.

Run: `pnpm test`
Expected: 전부 PASS (W1·W2 테스트 무회귀 — 기존 테스트는 코멘트 UI를 단언하지 않는다).

- [ ] **Step 7: 게이트 후 커밋**

Run: `pnpm typecheck` → `pnpm test` → `pnpm build` (전부 통과 확인)

```bash
git add src/features/wiki/components/CommentSection.tsx src/features/wiki/pages/PageViewPage.tsx src/app/App.w3-comments.test.tsx src/app/app.css
git commit -m "feat: CommentSection — 페이지 하단 코멘트 목록·작성과 빈 본문 Toast"
```

---

### Task 3: 사이드바 검색(조상 유지 필터) + README(MVP 마감)

**Files:**
- Create: `src/features/wiki/components/filterPagesWithAncestors.ts`
- Create: `src/features/wiki/components/filterPagesWithAncestors.test.ts`
- Modify: `src/features/wiki/components/WikiLayout.tsx` (검색 TextField + 필터 적용)
- Modify: `src/features/wiki/components/PageTree.tsx` (`forceExpand` prop)
- Create: `src/app/App.w3-search.test.tsx`
- Create: `README.md`

**Interfaces:**
- Consumes: `Page` 타입(`src/features/wiki/store/types.ts`), `PageTree({ spaceId, pages })`, WikiLayout의 기존 `pages` state, `renderApp` 하네스
- Produces:
  - `filterPagesWithAncestors(pages: Page[], query: string): Page[]` — 제목 부분일치(trim + 대소문자 무시). 매치된 페이지의 조상 체인을 결과에 포함해 트리 구조 보존. 빈 검색어면 원본 배열 그대로 반환(참조 동일). 입력 순서 유지
  - `PageTreeProps`에 `forceExpand?: boolean` 추가 — true면 접힘 상태 무시(전부 펼침)·접기 토글 숨김
  - 사이드바 접근성 표면: TextField 라벨 `"페이지 검색"`, 매치 0이면 `"검색 결과 없음"` 텍스트(트리 대신)

- [ ] **Step 1: 필터 순수함수 실패 테스트 작성**

Create `src/features/wiki/components/filterPagesWithAncestors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Page } from "../store/types";
import { filterPagesWithAncestors } from "./filterPagesWithAncestors";

const T = "2026-07-01T00:00:00.000Z";

function makePage(id: string, title: string, parentId: string | null, position = 1): Page {
  return {
    id, spaceId: "sp1", parentId, title, body: "", position,
    createdBy: "u1", updatedBy: "u1", createdAt: T, updatedAt: T,
  };
}

// 시드와 동일한 계층: pg1 ─ pg3 ─ pg5 / pg1 ─ pg4 / pg2
const PAGES: Page[] = [
  makePage("pg1", "시작하기", null, 1),
  makePage("pg2", "팀 규칙", null, 2),
  makePage("pg3", "개발 환경 설정", "pg1", 1),
  makePage("pg4", "배포 가이드", "pg1", 2),
  makePage("pg5", "로컬 DB 설정", "pg3", 1),
];

describe("filterPagesWithAncestors", () => {
  it("빈 검색어(공백만 포함)는 원본 배열을 그대로 반환한다", () => {
    expect(filterPagesWithAncestors(PAGES, "")).toBe(PAGES);
    expect(filterPagesWithAncestors(PAGES, "   ")).toBe(PAGES);
  });

  it("매치된 페이지와 조상 체인만 남긴다 — '설정'은 pg3·pg5와 조상 pg1", () => {
    const result = filterPagesWithAncestors(PAGES, "설정");
    expect(result.map((p) => p.id)).toEqual(["pg1", "pg3", "pg5"]);
  });

  it("대소문자를 무시하고 부분일치한다", () => {
    const pages = [makePage("a", "API Guide", null)];
    expect(filterPagesWithAncestors(pages, "api")).toHaveLength(1);
    expect(filterPagesWithAncestors(pages, "GUIDE")).toHaveLength(1);
  });

  it("매치가 없으면 빈 배열을 반환한다", () => {
    expect(filterPagesWithAncestors(PAGES, "존재하지않는제목")).toEqual([]);
  });

  it("루트가 직접 매치되면 하위는 포함하지 않는다", () => {
    const result = filterPagesWithAncestors(PAGES, "시작하기");
    expect(result.map((p) => p.id)).toEqual(["pg1"]);
  });

  it("순환 parentId 데이터에서도 멈추지 않는다", () => {
    const cyclic = [makePage("a", "순환 설정 A", "b"), makePage("b", "순환 B", "a")];
    const result = filterPagesWithAncestors(cyclic, "설정");
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm test src/features/wiki/components/filterPagesWithAncestors.test.ts`
Expected: FAIL — `./filterPagesWithAncestors` 모듈이 없어 import 에러.

- [ ] **Step 3: 필터 순수함수 구현**

Create `src/features/wiki/components/filterPagesWithAncestors.ts`:

```ts
import type { Page } from "../store/types";

/**
 * 제목 부분일치(대소문자 무시) 검색 필터 — 매치된 페이지의 조상 체인을 결과에 포함해
 * 트리 구조(계층 표시)를 보존한다. 빈 검색어면 원본 배열을 그대로 반환한다(원상복귀).
 * 반환 순서는 입력 순서 유지 (스토어의 position 오름차순 그대로 → PageTree가 재구성 가능).
 */
export function filterPagesWithAncestors(pages: Page[], query: string): Page[] {
  const q = query.trim().toLowerCase();
  if (!q) return pages;
  const byId = new Map(pages.map((p) => [p.id, p]));
  const keep = new Set<string>();
  for (const page of pages) {
    if (!page.title.toLowerCase().includes(q)) continue;
    // 매치 + 조상 체인 포함. keep에 이미 있는 id에서 걷기를 멈추므로 순환 데이터에도 안전
    let current: Page | undefined = page;
    while (current !== undefined && !keep.has(current.id)) {
      keep.add(current.id);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
  }
  return pages.filter((p) => keep.has(p.id));
}
```

- [ ] **Step 4: 단위 GREEN 확인**

Run: `pnpm test src/features/wiki/components/filterPagesWithAncestors.test.ts`
Expected: 6개 전부 PASS.

- [ ] **Step 5: 검색 RTL 실패 테스트 작성**

Create `src/app/App.w3-search.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W3 사이드바 검색", () => {
  it("'설정' 입력 시 매치(pg3·pg5)와 조상(pg1)만 남고, 비우면 전체가 돌아온다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.type(screen.getByLabelText("페이지 검색"), "설정");
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    // 매치 + 조상 체인 유지 (계층 구조 보존)
    expect(within(tree).getByRole("link", { name: "개발 환경 설정" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: "시작하기" })).toBeInTheDocument();
    // 비매치는 숨김
    expect(within(tree).queryByRole("link", { name: "팀 규칙" })).not.toBeInTheDocument();
    expect(within(tree).queryByRole("link", { name: "배포 가이드" })).not.toBeInTheDocument();
    // 비우면 원상복귀
    await user.clear(screen.getByLabelText("페이지 검색"));
    const restored = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(restored).getByRole("link", { name: "팀 규칙" })).toBeInTheDocument();
    expect(within(restored).getByRole("link", { name: "배포 가이드" })).toBeInTheDocument();
    expect(within(restored).getAllByRole("link")).toHaveLength(5);
  });

  it("접힌 노드도 검색 중에는 펼쳐 보이고, 검색을 비우면 접힘 상태로 돌아간다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    // pg1을 접는다 → 하위 pg3 숨김
    await user.click(screen.getByRole("button", { name: "시작하기 하위 접기" }));
    const collapsed = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(collapsed).queryByRole("link", { name: "개발 환경 설정" })).not.toBeInTheDocument();
    // 검색 중엔 접기 무시 — 전부 펼침, 접기 토글도 없다
    await user.type(screen.getByLabelText("페이지 검색"), "설정");
    const searching = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(searching).getByRole("link", { name: "개발 환경 설정" })).toBeInTheDocument();
    expect(within(searching).getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
    expect(
      within(searching).queryByRole("button", { name: /하위 (접기|펼치기)/ }),
    ).not.toBeInTheDocument();
    // 비우면 접힘 상태 복귀
    await user.clear(screen.getByLabelText("페이지 검색"));
    const restored = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(restored).queryByRole("link", { name: "개발 환경 설정" })).not.toBeInTheDocument();
    expect(within(restored).getByRole("button", { name: "시작하기 하위 펼치기" })).toBeInTheDocument();
  });

  it("매치가 없으면 '검색 결과 없음'을 보여준다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.type(screen.getByLabelText("페이지 검색"), "존재하지않는제목");
    expect(screen.getByText("검색 결과 없음")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "페이지 트리" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: RED 확인**

Run: `pnpm test src/app/App.w3-search.test.tsx`
Expected: 3개 전부 FAIL — 라벨 "페이지 검색"인 입력이 아직 없다.

- [ ] **Step 7: WikiLayout에 검색 TextField + 필터 적용**

`src/features/wiki/components/WikiLayout.tsx` 전체를 아래로 교체:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate, useParams } from "react-router";
import { Avatar, Button, Select, Spinner, TextField } from "@chanho/react";
import type { Page, Space, User } from "../store/types";
import { getCurrentUser, listPages } from "../store/wikiStore";
import { PageTree } from "./PageTree";
import { SpaceCreateModal } from "./SpaceCreateModal";
import { filterPagesWithAncestors } from "./filterPagesWithAncestors";

export interface WikiLayoutProps {
  spaces: Space[];
  /** 스페이스 목록이 바뀌었을 때(생성 등) App이 다시 로드하도록 알린다 */
  onSpacesChanged: () => void | Promise<void>;
}

/** Outlet으로 하위 라우트에 전달하는 컨텍스트 */
export interface WikiOutletContext {
  pages: Page[] | null;
  /** 현재 스페이스 (Breadcrumbs의 스페이스 이름 등) */
  space: Space;
  /** 페이지 생성/수정/삭제 후 사이드바 트리를 다시 로드한다 */
  reloadPages: () => Promise<void>;
}

export function WikiLayout({ spaces, onSpacesChanged }: WikiLayoutProps) {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<User | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void getCurrentUser().then(setMe);
  }, []);

  const current = spaces.find((s) => s.id === spaceId);
  const currentId = current?.id ?? null;

  useEffect(() => {
    if (!currentId) return;
    setPages(null);
    setQuery(""); // 스페이스 전환 시 검색 초기화
    void listPages(currentId).then(setPages);
  }, [currentId]);

  const reloadPages = useCallback(async () => {
    if (!currentId) return;
    setPages(await listPages(currentId));
  }, [currentId]);

  if (!current) {
    // 존재하지 않는 스페이스 ID → 첫 스페이스로
    return <Navigate to={`/spaces/${spaces[0].id}`} replace />;
  }

  const searching = query.trim().length > 0;
  // 검색어가 비어 있으면 원본 배열 그대로 (원상복귀). Outlet context에는 항상 전체 pages를 준다
  const visiblePages = pages === null ? null : filterPagesWithAncestors(pages, query);

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
        <TextField
          label="페이지 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목으로 검색"
        />
        {visiblePages === null ? (
          <Spinner size="small" label="페이지 트리 로딩 중" />
        ) : searching && visiblePages.length === 0 ? (
          <p className="page-tree-empty">검색 결과 없음</p>
        ) : (
          <PageTree spaceId={current.id} pages={visiblePages} forceExpand={searching} />
        )}
        <Button variant="subtle" onClick={() => navigate(`/spaces/${current.id}/pages/new`)}>
          새 페이지
        </Button>
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
          <Outlet context={{ pages, space: current, reloadPages } satisfies WikiOutletContext} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: PageTree에 forceExpand prop 추가**

`src/features/wiki/components/PageTree.tsx`에 3군데 수정.

(1) props 인터페이스와 함수 시그니처:

```tsx
export interface PageTreeProps {
  spaceId: string;
  pages: Page[];
  /** true면 접힘 상태를 무시하고 전부 펼친다(검색 중) — 접기 토글도 숨긴다 */
  forceExpand?: boolean;
}
```

```tsx
export function PageTree({ spaceId, pages, forceExpand = false }: PageTreeProps) {
```

(2) `renderNodes` 안의 접힘 판정 — `const isCollapsed = collapsed.has(page.id);`를 교체:

```tsx
        const isCollapsed = !forceExpand && collapsed.has(page.id);
```

(3) 토글 렌더 조건 — `{children.length > 0 ? (`를 교체 (검색 중엔 토글 대신 스페이서):

```tsx
              {children.length > 0 && !forceExpand ? (
```

(하위 렌더 조건 `{children.length > 0 && !isCollapsed ? renderNodes(children) : null}`은 isCollapsed가 이미 forceExpand를 반영하므로 그대로 둔다.)

- [ ] **Step 9: GREEN 확인**

Run: `pnpm test src/app/App.w3-search.test.tsx`
Expected: 3개 전부 PASS.

Run: `pnpm test`
Expected: 전부 PASS — 특히 W1 `App.test.tsx`의 트리 접기/펼치기 테스트 무회귀(forceExpand 기본값 false).

- [ ] **Step 10: 게이트 후 커밋 (검색)**

Run: `pnpm typecheck` → `pnpm test` → `pnpm build` (전부 통과 확인)

```bash
git add src/features/wiki/components/filterPagesWithAncestors.ts src/features/wiki/components/filterPagesWithAncestors.test.ts src/features/wiki/components/WikiLayout.tsx src/features/wiki/components/PageTree.tsx src/app/App.w3-search.test.tsx
git commit -m "feat: 사이드바 페이지 검색 — 조상 체인 유지 필터·검색 중 전체 펼침·검색 결과 없음"
```

- [ ] **Step 11: README 작성 (MVP 마감 문서 — alm-front README 미러)**

Create `README.md` (repo 루트 `C:\MSA_TEMPLATE\wiki-front\README.md`):

````markdown
# WIKI Front — 컨플루언스 클론

Chanho Design System(@chanho/react·tokens)의 소비 2호 프로젝트. ALM Front(지라 클론)와 동일한 철학의 독립 프론트 앱이며, 향후 MSA의 한 서비스로 게이트웨이 뒤에 배치된다.

## MVP 범위 (완료)

- **스페이스 다중** — 생성/전환, 키 접두어(자동 대문자, 중복 거부)
- **페이지 계층** — parentId 트리, 사이드바 접이식 트리(현재 페이지 하이라이트, 항목별 하위 페이지 추가)
- **페이지 CRUD + 마크다운 렌더링** — react-markdown + remark-gfm(표), 작성/미리보기 Tabs, raw HTML 미렌더(XSS 방어)
- **버전 히스토리** — 저장마다 자동 스냅샷(스토어 부수효과), HistoryModal에서 버전 목록·미리보기·복원(복원도 새 버전으로 쌓여 히스토리가 끊기지 않음)
- **코멘트** — 페이지 하단 목록(오름차순) + 작성
- **사이드바 제목 검색** — 부분일치(대소문자 무시), 매치의 조상 체인을 유지해 트리 구조 보존

데이터는 localStorage 목업(`wiki.v1`, 손상 시 시드 재생성), 유저는 목업 4명 고정(지라 클론과 동일 세트). 화면은 `src/features/wiki/store/wikiStore.ts`의 async 함수만 호출하므로 백엔드(wiki-service)·Keycloak OIDC가 생기면 이 파일 내부만 fetch로 교체한다.

## 스택

Vite 7 · React 19 · TypeScript(strict) · react-router 7 · @chanho/react 0.2.0 + @chanho/tokens 0.1.0(tarball, `file:../design-system/artifacts/*.tgz`) · react-markdown + remark-gfm · Vitest + Testing Library. **UI는 100% 디자인 시스템 — 타 UI 라이브러리 금지.**

## 개발

```bash
pnpm install     # ../design-system/artifacts 의 tarball 필요
pnpm dev         # http://localhost:5173
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
pnpm build       # vite build
```

## 구조

```
src/
├── app/                # 라우터(/spaces/:spaceId/pages/...), 전역 스타일, 테스트 하네스
├── features/wiki/
│   ├── pages/          # PageViewPage, PageEditPage, SpaceIndexPage
│   ├── components/     # WikiLayout, PageTree, HistoryModal, CommentSection, MarkdownView ...
│   └── store/          # wikiStore.ts (백엔드 교체 지점) + 테스트
└── mock/               # 시드, 목업 유저
```

## 문서

- 설계: `docs/superpowers/specs/2026-07-11-wiki-clone-design.md`
- 구현 계획(웨이브별): `docs/superpowers/plans/`
````

- [ ] **Step 12: 최종 게이트(번들 확인 포함) 후 커밋 — MVP 마감**

Run: `pnpm typecheck` → `pnpm test` → `pnpm build`
Expected: 전부 통과. `pnpm build` 출력에서 번들 구성이 정상인지 확인 — dist에 index.html + JS/CSS 청크가 생성되고 빌드 에러·경고 없음 (이번 웨이브는 새 의존성이 없으므로 번들이 W2 대비 크게 늘지 않아야 한다).

```bash
git add README.md
git commit -m "docs: README — MVP 범위·스택·개발 명령·구조 (MVP 마감)"
```

---

## Self-Review 기록

- **스펙 커버리지**: §6 W3 세 항목 → Task 1(히스토리+복원), Task 2(코멘트), Task 3(검색). §4 HistoryModal 규칙(최신순 목록 → 선택 시 MarkdownView 미리보기 + 복원 → 모달 닫고 보기 갱신 + Toast) → Task 1 Step 9~10. §7 RTL 핵심 흐름 ①②(Task 1) ③④(Task 2) ⑤(Task 3) 전부 테스트 코드로 존재. 스토어 no-op·복원 스냅샷은 W1 `wikiStore.versions.test.ts`가 이미 커버 — 중복 작성 안 함
- **W2 회귀 처리**: `App.w2-view.test.tsx`의 "히스토리 버튼 없음" 단언은 W3에서 필연적으로 깨진다 → Task 1 Step 7에서 반전(RED 사이클에 포함)
- **타입 일관성**: `HistoryModalProps { page, users, onRestored }` = Task 1 Step 9 정의·Step 10 사용 일치. `CommentSectionProps { pageId, users }` = Task 2 Step 3 정의·Step 4 사용 일치. `filterPagesWithAncestors(pages, query)` = Task 3 Step 3 정의·Step 7 사용 일치. `forceExpand` = Step 8 정의·Step 7 전달 일치
- **토큰·API 검증**: Modal/Tabs/TextField/TextArea/Button/Avatar 시그니처와 `--chanho-*` 토큰 전부 소스에서 확인(존재하지 않는 `border-brand`/`background-selected` 배제, `border-focused`/`background-brand-subtle` 사용)
- **테스트 단언 실데이터 검증**: pv1/pv2 저장자·본문, c1/c2 작성자·본문, "설정" 매치 집합(pg3·pg5+조상 pg1) 전부 `src/mock/seed.ts` 원문과 대조 완료. "이서연"은 페이지 메타에도 나타나므로 코멘트 단언은 `within(region)`으로 스코프
