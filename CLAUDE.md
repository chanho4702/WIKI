# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 명령어 — 패키지 매니저는 **pnpm** (npm 아님)

```bash
GH_PACKAGES_TOKEN=$(gh auth token) pnpm install   # 디자인시스템은 GitHub Packages(@chanho4702/*, pnpm alias로 @chanho/*). 최초 1회 ~/.npmrc에 `//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}` 추가
pnpm dev           # Vite dev 서버 → http://localhost:5174/wiki/ (base "/wiki/")
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run (전체)
pnpm test src/features/wiki/editor/markdown.test.ts   # 단일 파일
pnpm test -t "테스트명 부분일치"                        # 단일 테스트
pnpm build
```

lint 스크립트는 없다 — `pnpm typecheck` + `pnpm test`가 게이트다.

목업 dev(`VITE_API_PROXY= pnpm dev`)에서 로딩 스켈레톤을 보려면 주소에 `?mockDelay=1500`(ms)을 붙인다 — 그 탭 동안
목업 응답이 그만큼 늦게 온다(`store/mock/devDelay.ts`, `?mockDelay=0`이면 끔). 테스트·프로덕션에서는 켜지지 않는다.
로딩 자리는 스피너가 아니라 `components/WikiSkeleton.tsx`(DS Skeleton 기반)로 그린다.

## 아키텍처 불변 조건 (위반 금지)

1. **모든 도메인 데이터 접근은 `src/features/wiki/store/wikiStore.ts`의 async 함수 경유.**
   wikiStore는 듀얼모드 파사드다 — 프로덕션 빌드 또는 `VITE_API_PROXY`/`VITE_API_BASE`가 있으면
   백엔드 어댑터(`wikiApi.ts` → `api/*`), 순수 dev/test면 localStorage(`wiki.v1`) 목업(`wikiMock.ts` →
   `mock/*`)으로 보낸다. 화면·컴포넌트는 wikiStore만 import하고 도메인 데이터를 fetch·localStorage로
   직접 다루지 않는다. (UI 프리퍼런스·클라이언트 임시 상태 — 사이드바 너비, 별표, 페이지 너비, 방문
   기록 — 는 예외로 `src/features/wiki/lib/*`의 전용 모듈이 담당.) 스토어 계약은 `store/CLAUDE.md`,
   백엔드 계약은 `docs/backend/2026-07-17-wiki-service-requirements.md`.
2. **저장 포맷은 마크다운 문자열**(`Page.body`). TipTap 에디터는 편집 표현일 뿐이고 저장 시
   `serializeMarkdown`으로 직렬화한다. 이 결정은 로드맵 전역 결정
   (`docs/roadmap/2026-07-17-platform-roadmap.md`) — 마크다운으로 표현 불가한 블록(토글,
   콜아웃, 임베드 등)을 추가하기 전에 반드시 로드맵의 `⚠️ 저장 포맷 재논의` 플래그를 확인한다.
3. **에디터 스키마의 단일 원천은 `src/features/wiki/editor/extensions/base.ts`.**
   스키마에 영향을 주는 확장은 반드시 거기에만 추가한다 — WikiEditor(화면)와
   markdown.ts(헤드리스 변환기)가 같은 확장 목록을 공유해야 마크다운 왕복이 안전하다.
4. **UI는 100% `@chanho/react` + `@chanho/tokens` 디자인 시스템** — 타 UI 라이브러리를 도입하지 않는다.
5. 보기 렌더(react-markdown)는 **raw HTML을 렌더하지 않는다**(XSS 방어). 에디터 쪽도
   `Markdown.configure({ html: false })` — 양쪽 정책을 함께 유지한다.

## 큰 그림

- MSA_TEMPLATE(멀티레포 루트 `C:\MSA_TEMPLATE`)의 위키(컨플루언스 클론) 프론트.
  nginx 게이트웨이 뒤 `/wiki/` 경로에서 서빙 — `vite.config.ts base`(`VITE_BASE`, 기본 `/wiki/`)가
  원천이고 라우터 basename은 `main.tsx`가 `import.meta.env.BASE_URL`에서 파생한다(공개 문서는 `/docs/`).
- 인증(`src/auth/AuthGate`)은 **프로덕션(`import.meta.env.PROD`)에서만 활성** — dev/vitest는
  게이트가 꺼져 인증 없이 동작한다. AT는 메모리, RT는 HttpOnly 쿠키, 401 시 1회 refresh 재시도.
- 라우터는 **데이터 라우터**다 — `main.tsx`의 `createBrowserRouter`가 모든 경로를 `App` 하나로 보내고,
  실제 라우트 트리는 `App.tsx`의 선언형 `<Routes>`가 갖는다(스페이스 목록을 받아야 리다이렉트 대상이
  정해지기 때문). 데이터 라우터라서 `useBlocker`(편집 화면 이탈 가드)를 쓸 수 있다 — `BrowserRouter`로
  되돌리면 가드가 터진다.
- 라우트: 글로벌 셸 `AppShell`(헤더·`GlobalSidebar`)이 전부 감싼다. `/home`, `/spaces`(디렉토리),
  `/search`, `/tasks`, `/settings/notifications`, `/admin/*`(검색 색인·조직·감사·이관 — 서버가 권한 판정),
  `/spaces/:spaceId` 아래 개요·`pages/new`·`pages/:pageId`(`/edit`, `/history/*`)·`folder/:folderId`·
  `blog`·`labels`·`trash`·`archive`·`settings/:section`. 그 외는 첫 스페이스로 redirect.
  공개 문서(읽기 전용) 인스턴스는 쓰기 화면 라우트를 리다이렉트로 바꾸고 편집기 청크를 번들에서 뺀다.
- 스토어 구조(`src/features/wiki/store/`): `wikiStore.ts`(파사드) · `wikiApi.ts`+`api/*`(백엔드 어댑터,
  목업을 import하지 않는다) · `wikiMock.ts`+`mock/*`(목업, `mock/db.ts`가 저장소 상태) · `types.ts`+
  `model/*`(도메인 타입) · `mapping.ts`(백엔드 DTO ↔ 도메인, id는 프론트에서 항상 string) ·
  `apiClient.ts`(인증 fetch 단일 통로) · `platformApi.ts`(설치 옵션 플래그). 배럴(`wikiApi`·`wikiMock`·
  `types`)은 재내보내기만 하므로 새 함수는 도메인 모듈에 쓰고 배럴과 wikiStore에 한 줄씩 더한다.
- 하위 디렉토리 CLAUDE.md: `src/features/wiki/store/`(스토어 계약),
  `src/features/wiki/editor/`(에디터 내부 규약) — 해당 영역 수정 전 필독.

## 테스트 규약

- `src/app/App.w<N>-*.test.tsx` = 기능 묶음(웨이브)별 **App 통합 테스트**. `testUtils.tsx`의
  `renderApp(initialPath)` 하네스(`createMemoryRouter` 데이터 라우터 + ToastProvider)를 쓴다 — 프로덕션과
  같은 라우터 모양이어야 `useBlocker`가 동작한다. 새 기능 통합 테스트는 가장 큰 웨이브 번호 파일 패턴을 따른다.
  라우터를 직접 띄워야 하면 `createTestRouter(path, extra)`를 쓰고, `navigate()`는 비동기라 `await act(...)`로 감싼다.
- 전체 실행(`pnpm test`)은 병렬 부하로 jsdom 렌더 대기가 산발적으로 넘칠 수 있다 — 실패한 파일은 단독으로
  다시 돌려 판정한다(같은 파일이 단독에서도 실패해야 진짜 실패).
- jsdom에서 contenteditable 타이핑이 불안정하므로 에디터 입력은
  `editor/editorTestRegistry.ts` 경유로 TipTap commands를 직접 호출한다
  (프로덕션 코드는 이 레지스트리에 **쓰기만** 하고 읽지 않는다).
- wikiStore 테스트는 `__resetForTest()`로 메모리 캐시를 초기화한다.
- 유닛 테스트는 대상 파일 옆에 `*.test.ts(x)`로 배치한다(colocation).

## 코드 규약

- 주석·에러 메시지·문서는 **한국어**. 주석은 "왜"(계약·경합·정책)를 설명할 때만 단다 —
  기존 코드의 밀도를 따른다.
- 스토어 에러 메시지는 사용자에게 그대로 노출되는 한국어 문장이다 — 형식을 유지한다.

## 문서 맵

| 위치 | 내용 |
|---|---|
| `README.md` | 실측 기준 전체 소개(스택·기능·인증 흐름·구조·라우트) — 기능 추가 시 갱신 |
| `docs/roadmap/` | 제품 로드맵(26개 기능 영역, 전역 결정, 저장 포맷 플래그) |
| `docs/backend/` | wiki-service 백엔드 계약(wikiStore → REST 매핑, 정책 결정 대기 목록) |
| `docs/superpowers/specs·plans/` | 웨이브별 설계 문서·구현 계획(알려진 한계 포함) |
