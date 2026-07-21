# 위키 홈 대시보드 (`/wiki/home`) — 설계 문서

작성 2026-07-21. 사용자 제공 캡처(Confluence 홈) 6장 분석 기반.
범위 결정: **홈 대시보드 중심 + 목업(localStorage)으로 가능한 것만**. 나머지(개요 페이지·블로그·캘린더·실제 팔로우/반응/알림·글로벌 네비 전면 개편)는 §7에 후속으로 카탈로그.

관련: `docs/roadmap/2026-07-21-feature-checklist.md`(§5 검색·§7 협업·§8 부가와 교차), `docs/superpowers/specs/2026-07-21-ui-overhaul-design.md`(디자인시스템 확장 워크플로).

## 1. 캡처에서 확인한 기능 (분석)

| 캡처 | 기능 |
|---|---|
| home1 / home0.추천 | `/wiki/home` "추천" 랜딩 — **"마지막 작업하던 곳에서 다시 시작"**(최근 방문 카드 그리드) + **"최신 업데이트 살펴보기"**(활동 피드 + 팔로우/인기/캘린더 탭, 정렬, 피드 편집, dismissible 배너) |
| home1최근항목 | 사이드바 **최근** 플라이아웃 — 필터 + 날짜별 그룹(오늘…) + 항목(아이콘·제목·스페이스·N분 전·초안 배지) + "최근 항목 모두 보기" |
| home2스페이스 | 사이드바 **스페이스** 플라이아웃 — 필터 + 별표표시됨 + 최근 + 모든 스페이스 보기, 항목 → `/wiki/spaces/{KEY}/overview` |
| space 페이지 | 스페이스 디렉토리 — 자주 찾는(카드) + **모든 스페이스(테이블: Space name·Labels·Owner·Actions + 분류/필터 드롭다운)** |
| 특정 스페이스 페이지 | 스페이스 **개요** 페이지 — 개요 본문 + 최근 작업/최근 업데이트 + 블로그 스트림 + 연락처, 스페이스 사이드바(바로가기·콘텐츠 트리·블로그·캘린더·앱) |

## 2. MVP 범위 (이번 구현)

1. **`/home` 라우트 + 홈 대시보드 셸** — 상단바(기존 WikiTopBar) + 경량 좌측 네비 레일 + 중앙 콘텐츠(최대폭 ~1040px).
2. **"이어서 작업" 섹션** — 최근 방문 페이지 카드 그리드(최대 6개).
3. **"최신 업데이트" 피드** — 탭(**팔로우 / 인기**) + 항목 리스트. 정렬 드롭다운, dismissible 안내 배너.
4. **좌측 네비 레일 (경량)** — 추천(활성)/최근/별표/스페이스. **최근·스페이스는 플라이아웃**(기존 SpaceFlyout 패턴 재사용/확장), 스페이스 → `/spaces`.
5. **랜딩 변경** — 루트/미지정 경로 → `/home`(기존: 첫 스페이스). 브랜드 로고 → `/home`.

**MVP에서 제외(§7 카탈로그):** 캘린더 탭, 실제 반응(이모지 토글·집계), 실제 팔로우(별표로 프록시), 블로그·캘린더·연락처, 스페이스 개요 페이지, 알림, 글로벌 네비 전면 개편, 디렉토리 테이블/Labels/Owner/분류·필터.

## 3. 데이터 (wikiStore, 목업)

아키텍처 불변조건 #1 유지 — 모든 도메인 접근은 `wikiStore` async 경유. UI 프리퍼런스(별표·배너 dismiss)는 `lib/*`.

### 3.1 최근 방문 (이어서 작업)
- **저장:** wikiStore가 관리하는 방문 로그(`wiki.recent.v1` 전용 키 또는 `wiki.v1.visits` 맵 `{ pageId: isoTimestamp }`). 단일 사용자 목업 전제.
- `recordPageVisit(pageId: string): Promise<void>` — 페이지 조회 시 호출(PageViewPage). 같은 페이지 재방문 시 타임스탬프 갱신.
- `listRecentlyVisitedPages(limit = 6): Promise<RecentPage[]>` — 방문 시각 내림차순, 삭제된 페이지 방어적 제외. `RecentPage = { page, visitedAt }`.
- 백엔드 매핑: `GET /recent`, `POST /recent/{pageId}` (docs/backend 후속).

### 3.2 최신 업데이트 (피드)
- `listRecentUpdates({ spaceIds?, sort, limit }): Promise<FeedUpdate[]>`
  - `spaceIds` 지정 시 해당 스페이스만 — **팔로우 탭**은 별표 스페이스 id를 넘긴다(HomePage가 `useStarredSpaces`로 읽어 전달 — store는 UI lib에 의존하지 않음).
  - `sort: 'recent'` → `page.updatedAt` 내림차순. `sort: 'popular'` → 인기 휴리스틱(코멘트 수 + 버전 수) 내림차순, 동률은 updatedAt.
  - `FeedUpdate = { page, updatedBy: User, space: Space, updatedAt, excerpt }`.
- **발췌(excerpt):** `lib/excerpt.ts` — 마크다운에서 헤딩/기호 제거 후 첫 ~140자 평문. 렌더 XSS 정책(raw HTML 금지)과 무관(평문 텍스트).

### 3.3 상대 시간
- `lib/relativeTime.ts` — `"N분 전" / "N시간 전" / "N일 전" / 절대일자` (한국어). 카드·피드·플라이아웃 공용.

## 4. 라우팅 (`App.tsx`)

```
/home                     → <HomePage/>            (신규, 글로벌 셸)
/spaces                   → <SpaceDirectoryPage/>  (기존)
/spaces/:spaceId/*        → <WikiLayout/> 중첩       (기존)
/ 및 미지정               → <Navigate to="/home"/>  (기존: 첫 스페이스 → 변경)
```
- WikiTopBar 브랜드("WIKI")를 `/home`으로 링크.
- 스페이스가 0개면 기존 EmptyState 흐름 유지(홈보다 우선).

## 5. 컴포넌트 (100% `@chanho/react` + lucide)

| 컴포넌트 | 역할 | 재사용 DS |
|---|---|---|
| `pages/HomePage.tsx` | 라우트 셸 — WikiTopBar + 네비 레일 + ResumeSection + UpdatesFeed | — |
| `components/HomeNavRail.tsx` | 경량 좌측 네비(추천/최근/별표/스페이스) + 최근·스페이스 플라이아웃 | Button |
| `components/ResumeSection.tsx` | "이어서 작업" 카드 그리드 | Card, Badge |
| `components/UpdatesFeed.tsx` | 탭(팔로우/인기) + 정렬 + 배너 + 피드 리스트 | Tabs, Button, EmptyState |
| `components/FeedItem.tsx` | 활동 카드(아바타·메타·제목·발췌·반응버튼) | Avatar, Card |
| `components/RecentFlyout.tsx` | 최근 항목 플라이아웃(필터+날짜그룹) | TextField |

- 카드 아이콘: lucide `FileText`. 임시본 → DS `Badge`(neutral). 반응 버튼 → lucide `SmilePlus`(MVP no-op, `title`).
- 홈 셸 `만들기` = 현재 스페이스가 없으므로 **새 스페이스**만(또는 스페이스 선택 후 새 페이지) — WikiTopBar `create`에 홈용 메뉴 전달.
- 스타일은 `app.css`에 `.home-*` 스코프 신규. 토큰만 사용(하드코딩 색 금지).

## 6. 접근법 후보 & 선택

- **홈 셸(선택 A):** 독립 `/home` 라우트 + 경량 자체 셸(TopBar + 네비 레일 + 콘텐츠). ↔ B) 스페이스용 WikiLayout 재사용(스페이스 종속이라 부적합) ↔ C) 글로벌 네비 전면 개편(범위 밖). → **A 채택**(최소 침습, 스페이스 셸 무변경).
- **팔로우 데이터(선택):** 별표 스페이스를 "팔로우"의 목업 프록시로 사용(기존 star 기능 재활용, 즉시 동작). 실제 팔로우/알림은 후속.
- **인기(선택):** 코멘트+버전 수 휴리스틱(목업 데이터로 계산 가능). 실제 조회수 기반은 백엔드 후속.

## 7. 후속 카탈로그 (이번 범위 밖, 문서화만)

- **캘린더 탭**, **실제 반응**(이모지 토글·집계·저장), **실제 팔로우/구독 + 알림**(체크리스트 §7 협업).
- **스페이스 개요 페이지**(`/spaces/:id/overview`) — 현재 첫 페이지 redirect 대체, 개요 본문+최근 업데이트+블로그+연락처.
- **블로그**(포스트 CRUD·스트림), **캘린더**, **연락처**.
- **디렉토리 보강** — 참고 캡처의 "모든 스페이스"는 **테이블(Labels·Owner·Actions·분류/필터)**. Stage 3에서 카드로 전환한 것과 상충 → §8 결정 필요.
- **글로벌 네비 전면 개편** — 홈/스페이스 공통의 글로벌 사이드바(추천/최근/별표/스페이스/앱).

## 8. 열린 결정 (사용자 리뷰 대기)

1. **랜딩 변경**: 루트 → `/home`으로 바꿔도 되나? (기존은 첫 스페이스로 직행)
2. **디렉토리**: 현재 카드 그리드 유지 vs 참고처럼 **테이블 + Labels/Owner/Actions**로 되돌림? (별도 스코프)
3. **팔로우=별표 프록시** 수용? **인기=코멘트+버전 휴리스틱** 수용?
4. **반응 버튼**: MVP는 표시만(no-op) — 수용? 캘린더 탭 숨김 수용?

## 9. 테스트 계획

- `wikiStore.recent.test.ts` — recordPageVisit/listRecentlyVisitedPages(순서·삭제 방어), listRecentUpdates(recent/popular 정렬·spaceIds 필터).
- `lib/excerpt.test.ts`, `lib/relativeTime.test.ts` — 순수 함수 단위.
- `App.w8-home.test.tsx` — 홈 라우트 렌더(이어서 작업 카드·피드), 탭 전환(팔로우↔인기), 카드/피드 클릭 네비게이션, 배너 dismiss 지속, 루트→/home redirect. `renderApp` 하네스 사용.
- 콜로케이션 유닛 테스트는 대상 옆.
