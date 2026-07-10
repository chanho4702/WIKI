# WIKI Front — 컨플루언스 클론 설계 문서

- 작성일: 2026-07-11
- 상태: 승인됨 (구현 계획 수립 전)
- 위치: `C:\MSA_TEMPLATE\wiki-front` (독립 repo → github.com/chanho4702/WIKI)

## 1. 목적과 배경

Chanho Design System(@chanho/react·tokens)의 소비 2호 프로젝트로 **컨플루언스 클론(위키)** 을 만든다. ALM Front(지라 클론)와 동일한 철학의 **독립 프론트 앱**이며, 향후 MSA의 한 서비스로 게이트웨이 뒤에 배치된다. 지라 클론에서 검증된 패턴(스토어 교체 지점, 웨이브 구현, tarball 소비)을 그대로 계승한다.

### 범위 (풀코스 MVP)

- 스페이스 다중 (생성/전환, 키 접두어)
- 페이지 계층 (부모-자식 트리, 사이드바 접이식 트리)
- 페이지 CRUD + **마크다운 렌더링** (react-markdown)
- **버전 히스토리** (저장마다 스냅샷, 보기 + 복원)
- 코멘트 (페이지 하단 목록+작성)
- 사이드바 제목 검색 (트리 필터)

### 범위 제외 (MVP)

- 실제 백엔드·인증: 데이터는 localStorage 목업, 유저는 목업 4명 고정(지라 클론과 동일 세트). 백엔드(wiki-service)·Keycloak OIDC는 후속 — 스토어 계층이 교체 지점
- 페이지 이동(부모 변경)·트리 드래그 정렬
- 첨부/이미지 업로드, 페이지 간 링크 자동완성, 동시 편집·잠금
- 전문(full-text) 검색 — 사이드바 검색은 제목 필터만

## 2. 아키텍처

### 2.1 스택

Vite 7 + React 19 + TypeScript(strict) + react-router 7(단일 패키지) + **@chanho/react·@chanho/tokens(tarball 설치, `file:../design-system/artifacts/*.tgz` + pnpm 독립 워크스페이스 overrides)** + **react-markdown**(본문 렌더링 — UI 라이브러리 아님, 허용) + Vitest/Testing Library. **MUI 등 타 UI 라이브러리 금지 — UI는 100% 디자인 시스템.** @dnd-kit 불필요.

### 2.2 구조

```
src/
├── app/                # 앱 셸: 라우터, 전역 스타일, ToastProvider
├── features/wiki/
│   ├── pages/          # PageViewPage, PageEditPage
│   ├── components/     # WikiLayout, PageTree, SpaceCreateModal, HistoryModal, MarkdownView, CommentSection ...
│   └── store/          # wikiStore.ts (+ 테스트)
└── mock/               # 시드 데이터, 목업 유저 (지라 클론과 동일 4명)
```

### 2.3 핵심 규칙

1. **스토어 교체 가능성** — 화면은 `wikiStore.ts`의 async 함수만 호출한다. 백엔드가 생기면 이 파일 내부만 fetch로 교체 (지라 클론 jiraStore와 동일 철학)
2. **디자인 시스템 역성장** — 부족한 공용 컴포넌트는 앱에 만들지 않고 design-system에 추가 후 tarball 재생성해 소비한다 (이번 MVP는 기존 16개로 충분할 것으로 예상 — 선행 W0 없음)
3. **버전은 스토어의 부수효과** — 저장된 상태가 곧 버전이다: createPage가 v1을, updatePage가 적용 후 내용을 새 버전으로 자동 스냅샷. 화면 코드는 스냅샷 로직을 모른다
4. **에러는 한국어 메시지로 throw** — 화면은 Toast(danger)로 표시

## 3. 도메인 모델

```ts
interface User { id: string; name: string }                    // 목업 4명 (지라와 동일)

interface Space { id: string; key: string; name: string; createdAt: string }
// key: "DEV" 같은 대문자 접두어, 중복 금지 (지라 Project 미러)

interface Page {
  id: string; spaceId: string;
  parentId: string | null;                                     // null = 루트 페이지
  title: string; body: string;                                 // body = 마크다운 원문
  position: number;                                            // 형제 내 정렬 (생성순 max+1)
  createdBy: string; updatedBy: string;
  createdAt: string; updatedAt: string;
}

interface PageVersion {
  id: string; pageId: string;
  version: number;                                             // 1부터 증가
  title: string; body: string;                                 // 그 시점의 내용
  savedBy: string; savedAt: string;
}

interface Comment { id: string; pageId: string; authorId: string; body: string; createdAt: string }
```

### 도메인 규칙

- **페이지 트리**: parentId 인접 리스트. 트리 구성(자식 조회·정렬)은 화면에서 수행. 깊이 제한 없음
- **삭제**: 하위 페이지가 있으면 거부(`"하위 페이지가 있어 삭제할 수 없습니다"` throw). 삭제 시 해당 페이지의 코멘트·버전 연쇄 삭제
- **버전**: createPage가 v1 스냅샷 생성. updatePage는 저장 **후** 내용을 새 버전으로 스냅샷(version = max+1). title/body 어느 쪽이 바뀌어도 스냅샷, 둘 다 무변경이면 no-op(버전·updatedAt 불변)
- **복원**: restoreVersion = 해당 버전의 title/body로 updatePage 경로 재사용 → 복원도 새 버전으로 쌓임(히스토리 안 끊김)
- **스페이스 키**: 대문자 정규화 + 중복 거부 (지라 createProject 미러)
- 디자인 시스템 매핑: 작성자→Avatar, 액션 피드백→Toast, 편집 미리보기→Tabs, 히스토리→Modal

## 4. 화면 구성

- **WikiLayout**: 좌측 사이드바 = 스페이스 스위처 Select + 제목 검색 TextField(트리 필터) + **접이식 페이지 트리**(현재 페이지 하이라이트, 트리 항목에 하위 페이지 추가 액션) + "새 페이지" Button(루트에 생성). 우상단 현재 유저 Avatar. 스타일은 앱 로컬 CSS(토큰 변수만)
- **라우팅**: `/spaces/:spaceId/pages/:pageId` (보기), `/spaces/:spaceId/pages/:pageId/edit` (편집), `/spaces/:spaceId/pages/new?parent=<id>` (생성). `/`는 첫 스페이스의 첫 루트 페이지로 redirect. 스페이스 0개면 EmptyState→SpaceCreateModal. 페이지 0개면 "첫 페이지 만들기" EmptyState
- **PageViewPage**: Breadcrumbs(스페이스 / 조상 경로 / 현재) → 제목 h1 → 메타(수정자 Avatar+이름, 수정일) → **react-markdown 본문**(토큰 CSS로 heading/list/code/table 스타일) → 하단 CommentSection(목록+TextArea 작성). 우상단: 편집 / 히스토리 / 삭제 Button
- **PageEditPage**: 제목 TextField + Tabs(작성: 본문 TextArea / 미리보기: MarkdownView) + 저장/취소 Button. 생성·수정 공용
- **HistoryModal**: 버전 목록(vN, 저장자, 시각 — 최신순) → 선택 시 그 버전 본문 MarkdownView 미리보기 + "이 버전으로 복원" Button(복원 후 모달 닫고 보기 화면 갱신 + Toast)
- **SpaceCreateModal**: 이름+키 입력(키 자동 대문자, 중복 검사 에러 Toast) — 지라 ProjectCreateModal 미러

## 5. 스토어 API 계약 (`wikiStore.ts` — 전부 async)

```ts
listUsers(): Promise<User[]>
getCurrentUser(): Promise<User>                        // 목업 고정 유저

listSpaces(): Promise<Space[]>
createSpace(input: { key: string; name: string }): Promise<Space>   // key 중복 시 throw

listPages(spaceId: string): Promise<Page[]>            // position 오름차순, 트리 구성은 화면
getPage(id: string): Promise<Page | null>
createPage(input: { spaceId: string; parentId?: string | null;
  title: string; body?: string }): Promise<Page>       // v1 스냅샷 자동 생성
updatePage(id: string, patch: { title?: string; body?: string }): Promise<Page>
  // 실변경 시에만 새 버전 스냅샷 + updatedBy/updatedAt 갱신, 무변경이면 no-op
deletePage(id: string): Promise<void>                  // 하위 존재 시 throw, 코멘트·버전 연쇄 삭제

listVersions(pageId: string): Promise<PageVersion[]>   // version 내림차순(최신 먼저)
restoreVersion(pageId: string, versionId: string): Promise<Page>   // updatePage 경로 재사용

listComments(pageId: string): Promise<Comment[]>       // createdAt 오름차순
addComment(pageId: string, body: string): Promise<Comment>         // 빈 본문 throw
```

- 저장: localStorage 단일 키 `wiki.v1` (JSON 직렬화 + 손상 시 시드 재생성 — 지라 클론 교훈 반영). 첫 실행 시 시드(스페이스 1 "DEV", 루트 페이지 2 + 하위 페이지 2~3, 버전 몇 개, 코멘트 몇 개 — 마크다운 예시 포함 본문)
- 에러: 도메인 규칙 위반은 명확한 한국어 메시지로 throw — 화면은 Toast(danger)로 표시

## 6. 구현 단계

- **W1**: 스캐폴드(지라 클론 미러) + wikiStore 전체(+시드+테스트) + WikiLayout/페이지 트리/라우팅/스페이스 생성
- **W2**: PageViewPage(마크다운 렌더+Breadcrumbs+삭제) + PageEditPage(작성/미리보기 Tabs) + 페이지 생성 흐름
- **W3**: 버전 히스토리(HistoryModal+복원) + 코멘트 + 사이드바 검색

각 웨이브는 별도 구현 계획(Plan)으로 작성한다.

## 7. 테스트 전략

- **스토어 = 필수** (Vitest, localStorage): 스페이스 키 중복 거부, 하위 존재 시 삭제 거부, 삭제 연쇄(코멘트·버전), updatePage 버전 스냅샷(실변경만)·no-op, restoreVersion이 새 버전 생성, 손상 localStorage 시드 재생성
- **화면 = 핵심 흐름** (RTL): 트리 렌더(계층·하이라이트), 페이지 생성 흐름, 편집 저장→마크다운 렌더 반영, 코멘트 작성→목록 반영, 히스토리 복원 흐름, 검색 필터
- react-markdown 렌더 자체는 라이브러리 신뢰 — 우리 테스트는 "본문이 마크다운으로 렌더된다"(heading 존재 등) 수준만
- 게이트: `tsc --noEmit` + `vitest run` + `vite build` (지라 클론 관례 계승)
