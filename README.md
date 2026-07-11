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
