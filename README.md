# wiki-front — 위키 서비스 프론트엔드

MSA_TEMPLATE의 **위키(컨플루언스 클론) 프론트엔드**. 3개 프론트(`myFront` · `wiki-front` · `alm-front`) 중 하나로,
디자인 시스템(`@chanho/react`·`@chanho/tokens`)을 공유하고 게이트웨이 뒤에서 Keycloak OIDC SSO 체제에 속한다.

- **개발**: Vite dev 서버 `:5174`, 경로 접두어 `/wiki/` (`http://localhost:5174/wiki/`, `--strictPort`)
- **통합 배포**: nginx가 `/wiki/` 경로 아래로 서빙 (`vite.config.ts base: "/wiki/"`, `BrowserRouter basename="/wiki"`)
- **인증 대상**: `VITE_API_BASE`(프로덕션은 nginx same-origin) → auth-server의 OIDC/JWT 엔드포인트

현재 데이터는 localStorage 목업이며, 스토어(`src/features/wiki/store/wikiStore.ts`)의 async 함수만 화면에서 호출한다.
백엔드(wiki-service)·Keycloak이 붙으면 이 파일 내부만 fetch로 교체하면 된다.

---

## 스택 (실측)

| 영역 | 사용 |
|---|---|
| 빌드/런타임 | Vite 7 · React 19 · TypeScript |
| 라우팅 | react-router 7 (`BrowserRouter basename="/wiki"`) |
| 디자인 시스템 | `@chanho/react` 0.3.0 + `@chanho/tokens` 0.2.0 (tarball `file:../design-system/artifacts/*.tgz`) |
| 에디터 | **TipTap 2.27** — `@tiptap/react` · `starter-kit` · 확장(link, image, table/row/header/cell, task-list/item, placeholder) + `tiptap-markdown`(마크다운 왕복) |
| 보기 렌더 | react-markdown 10 + remark-gfm 4 (표) |
| 트리 DnD | `@dnd-kit/core` · `sortable` · `utilities` |
| 테스트 | Vitest 3 + Testing Library + jsdom |

UI는 100% `@chanho` 디자인 시스템으로 구성한다 — 타 UI 라이브러리를 쓰지 않는다.

---

## 주요 기능 (실측)

- **스페이스 다중** — 생성/전환. 키는 자동 대문자·중복 거부.
- **페이지 계층 트리** — `parentId` 트리, 사이드바 접이식(현재 페이지 하이라이트). `@dnd-kit` 드래그로 이동/정렬,
  자기 자손 밑 이동은 순환 검사로 거부(`movePage`).
- **블록 에디터(TipTap WYSIWYG)** — 대형 인라인 제목 + 본문 블록. StarterKit(제목 h1–3·목록·인용·코드블록 등) +
  표·체크리스트(task list)·이미지·링크 확장. 저장 시 본문을 마크다운으로 직렬화하며(`editor/markdown.ts` 왕복),
  파싱 실패 시 원문을 플레인 문단으로 폴백해 편집이 막히지 않는다.
- **위키 링크** — `[[제목]]`을 에디터에서 원자 노드(칩)로 승격(입력 규칙), 존재하지 않는 페이지 제목은
  `.wiki-chip-missing` 데코레이션으로 표시. 보기 화면에서는 내부 링크(존재=`wiki-link`, 부재=생성 링크)로 렌더.
- **페이지 보기** — Breadcrumbs(스페이스→조상→현재), 수정자/수정일, 마크다운 렌더(raw HTML 미렌더 = XSS 방어).
- **버전 히스토리** — 저장마다 자동 스냅샷(스토어 부수효과). HistoryModal에서 버전 목록·미리보기·diff(`DiffView`)·복원,
  복원도 새 버전으로 쌓여 히스토리가 끊기지 않는다.
- **코멘트** — 최상위 + 1단 답글, 본인만 수정/삭제, 최상위 삭제 시 답글 연쇄 삭제.
- **제목 검색** — 부분일치(대소문자 무시), 매치의 조상 체인을 유지해 트리 구조 보존.
- **다크 모드 토글**, **미저장 이탈 가드**(`beforeunload` + 취소 confirm).

데이터는 localStorage `wiki.v1`(손상 시 시드 재생성), 유저는 목업 고정(seed).

---

## 실행 (실측 — package.json)

```bash
pnpm install     # ../design-system/artifacts 의 tarball 필요
pnpm dev         # vite dev 서버
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm build       # vite build
```

`scripts` 정의는 `dev` / `typecheck` / `test` / `build` 네 개다.
루트 원커맨드(`scripts\dev-up.ps1`)는 이 앱을 `pnpm dev --port 5174 --strictPort`로 띄운다 → `http://localhost:5174/wiki/`.

---

## 환경변수

| 변수 | 용도 |
|---|---|
| `VITE_API_BASE` | 백엔드(auth-server) 오리진. `AuthGate`의 기본 클라이언트 `baseUrl`. 프로덕션은 nginx same-origin이라 빈 문자열, dev는 게이트가 꺼져 있어 미사용. |

repo에 `.env*` 파일은 커밋돼 있지 않다.

---

## 인증 / SSO 흐름 (실측)

로그인 게이트는 `src/auth/`에 있으며 **프로덕션(`import.meta.env.PROD`)에서만 활성**된다 — dev/vitest는 게이트를 꺼
인증 검증을 nginx 프로덕션 경로로만 수행한다.

1. **부트스트랩** (`AuthGate`) — 마운트 시 RT 쿠키로 silent refresh(`POST /api/auth/refresh`)를 시도.
   - 성공 → `GET /api/me`로 사용자를 받고 앱을 렌더.
   - 실패 → 돌아올 경로를 `post_login_redirect` 쿠키에 심고, `{VITE_API_BASE}/oauth2/authorization/keycloak`로
     리다이렉트(Keycloak SSO 세션이 살아 있으면 무프롬프트 왕복). 구글 직행은 `?kc_idp_hint=google`.
2. **토큰 취급** (`createAuthClient`) — AT는 인스턴스 메모리에만, RT는 백엔드 HttpOnly 쿠키.
   `apiFetch`는 Authorization 헤더를 자동 첨부하고 401이면 1회 refresh 후 재시도한다.
   동시 refresh는 in-flight dedup으로 1요청으로 합쳐 RT 회전/재사용 오탐(StrictMode 이중 실행)을 막는다.
3. **로그아웃** — 백채널(`POST /api/auth/logout`)로 서버가 Keycloak 세션(end_session)과 RT 쿠키를 정리하고,
   프론트는 메모리 AT만 비운 뒤 `/`로 이동한다.

계약 타입은 `src/auth/types.ts`(`AppUser`는 `GET /api/me` 응답과 1:1) 참조.

---

## 구조

```
src/
├── app/                  # main.tsx(AuthGate·BrowserRouter basename=/wiki), App.tsx(라우트), theme.ts, app.css, 테스트
├── auth/                 # client.ts(createAuthClient), AuthGate.tsx(useAuth), returnTo.ts, types.ts
├── features/wiki/
│   ├── pages/            # SpaceIndexPage, PageViewPage, PageEditPage
│   ├── components/       # WikiLayout, PageTree(+pageTreeDnd), HistoryModal, DiffView,
│   │                     #  CommentSection, MarkdownView, SpaceCreateModal, EmptySpaces, filterPagesWithAncestors
│   ├── editor/           # WikiEditor.tsx, markdown.ts(마크다운 왕복), extensions/(base.ts, wikiLink.ts), editorTestRegistry.ts
│   ├── lib/              # wikiLinks.ts, lineDiff.ts
│   └── store/            # wikiStore.ts(백엔드 교체 지점), types.ts
└── mock/                 # seed.ts, users.ts
```

---

## 라우트 (실측 — `App.tsx`, `basename="/wiki"`)

| 경로 | 화면 | 비고 |
|---|---|---|
| `/spaces/:spaceId` | `SpaceIndexPage` (WikiLayout index) | 첫 루트 페이지로 이어짐 |
| `/spaces/:spaceId/pages/new` | `PageEditPage` (생성) | 쿼리 `?parent=<id>`, `?title=<프리필>` |
| `/spaces/:spaceId/pages/:pageId` | `PageViewPage` | 스페이스 URL 불일치 시 실제 스페이스로 redirect |
| `/spaces/:spaceId/pages/:pageId/edit` | `PageEditPage` (수정) | |
| `*` | 첫 스페이스로 `Navigate` | 스페이스가 하나도 없으면 `EmptySpaces` |
