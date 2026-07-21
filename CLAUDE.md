# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 명령어 — 패키지 매니저는 **pnpm** (npm 아님)

```bash
pnpm install       # ../design-system/artifacts/*.tgz tarball 필요 (MSA_TEMPLATE 모노레포 체크아웃 전제)
pnpm dev           # Vite dev 서버 → http://localhost:5174/wiki/ (base "/wiki/")
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run (전체)
pnpm test src/features/wiki/editor/markdown.test.ts   # 단일 파일
pnpm test -t "테스트명 부분일치"                        # 단일 테스트
pnpm build
```

lint 스크립트는 없다 — `pnpm typecheck` + `pnpm test`가 게이트다.

## 아키텍처 불변 조건 (위반 금지)

1. **모든 도메인 데이터 접근은 `src/features/wiki/store/wikiStore.ts`의 async 함수 경유.**
   현재는 localStorage(`wiki.v1`) 목업이지만, 백엔드(wiki-service)가 붙으면 이 파일 내부만
   fetch로 교체한다 — 화면 무수정이 목표. 화면/컴포넌트에서 도메인 데이터를 localStorage로
   직접 읽고 쓰지 않는다. (UI 프리퍼런스 — 사이드바 너비, 별표, 페이지 너비 — 는 예외로
   `src/features/wiki/lib/*`의 전용 모듈이 담당.) 백엔드 계약: `docs/backend/2026-07-17-wiki-service-requirements.md`
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
  nginx 게이트웨이 뒤 `/wiki/` 경로에서 서빙 — `vite.config.ts base: "/wiki/"` +
  `BrowserRouter basename="/wiki"` 쌍으로 맞춘다.
- 인증(`src/auth/AuthGate`)은 **프로덕션(`import.meta.env.PROD`)에서만 활성** — dev/vitest는
  게이트가 꺼져 인증 없이 동작한다. AT는 메모리, RT는 HttpOnly 쿠키, 401 시 1회 refresh 재시도.
- 라우팅: `App.tsx` — `/spaces`(디렉토리, WikiLayout 밖 독립 라우트), `/spaces/:spaceId`
  (WikiLayout + index/new/view/edit), 그 외 전부 첫 스페이스로 redirect.
- 하위 디렉토리 CLAUDE.md: `src/features/wiki/store/`(스토어 계약),
  `src/features/wiki/editor/`(에디터 내부 규약) — 해당 영역 수정 전 필독.

## 테스트 규약

- `src/app/App.w<N>-*.test.tsx` = 웨이브(W1~W7)별 **App 통합 테스트**.
  `testUtils.tsx`의 `renderApp(initialPath)` 하네스(MemoryRouter + ToastProvider)를 쓴다.
  새 기능 통합 테스트도 이 패턴(현재 웨이브 번호 파일)을 따른다.
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
