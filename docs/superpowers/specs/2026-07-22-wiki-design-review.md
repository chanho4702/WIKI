# wiki-front 디자인 재검토 — 충실 복제 · DS 정합 · 접근성 · 시각 완성도

작성 2026-07-22 (디자이너 롤). 스펙 = 사용자 제공 컨플루언스 캡처(`화면.png`, `사이드바 및 헤더 참고.png`, `home*.png`, `space 페이지.png`, `특정 스페이스 페이지.png`, `에디터.png`, `버전기록.png`). 렌즈: `product-design` 스킬(Nielsen · WCAG 2.2 AA · 토큰 3계층 · §4 충실 복제). **검토 전용 — 코드 무수정.** 근거는 캡처명 / 토큰 / WCAG 기준 / 파일:라인으로 표기.

> 참고: 셸 설계문서(`2026-07-22-confluence-shell-design.md`)가 최근·별표·앱 플라이아웃, 스페이스 개요, 앱그리드, Rovo/블로그/캘린더/분류필터를 **명시적 후속(§3 4~5단계)**으로 이미 선언했다. 아래는 그 후속 항목을 캡처 대비로 구체화하고, 후속으로 선언되지 않은 실제 드리프트/DS/접근성 위반을 함께 짚는다.

---

## 가장 먼저 고칠 5개 (디자인 임팩트 순)

1. **[Critical] 하드코딩 팝오버 그림자 → 다크모드에서 소실.** `box-shadow: 0 4px 12px rgba(0,0,0,0.15)`가 5개 팝오버/플라이아웃에 하드코딩(app.css:1123·1258·1305·1367·1462). DS 다크 그림자는 밝은 테두리 링(`0 0 0 1px rgba(255,255,255,.10)…`)인데 이 검정 그림자는 다크 배경에서 거의 안 보여 팝오버가 배경과 붙는다. `--chanho-shadow-overlay`로 교체(같은 파일 이미 `--chanho-shadow-100`을 카드에 정상 사용 중 → 명백한 누락).
2. **[Important] 글로벌 사이드바 셸이 캡처와 크게 다르다.** 최근/별표/앱이 `disabled` 자리표시(GlobalSidebar.tsx:96~118), 푸터(Jira/팀 ↗·더 보기) 전무, 스페이스 컨텍스트에 캡처의 바로 가기·"콘텐츠" 헤더·만들기·블로그/캘린더가 없음. 모든 화면에 상시 노출되는 셸이라 체감 임팩트 최상.
3. **[Important] 스페이스 디렉토리 "자주 찾는 스페이스" 카드 드리프트.** 캡처(`space 페이지.png`)는 정사각 브랜드 색 아이콘 + 별표를 카드 우상단, 섹션 우측에 "자세히 표시" 링크, "모든 스페이스"에 `모든 분류`·`모든 필터` 드롭다운. 현재는 원형 Avatar + 행 끝 별표 + 드롭다운/자세히표시 없음.
4. **[Important] 홈 대시보드에 "최신 업데이트" 피드 전체 누락.** 캡처(`home*.png`) 홈의 절반이 팔로우/인기/캘린더 탭 + 정렬 드롭다운 + 피드 배너 + 활동 카드인데, 현재는 "이어서 작업" 카드 한 섹션만(HomePage.tsx).
5. **[Important] 아이콘/대비 DS 위반.** 사이드바 토글이 lucide가 아닌 텍스트 글리프 `⧉`(WikiTopBar.tsx:55), 별표가 `★/☆` 글리프(SpaceDirectoryPage.tsx:68·107) — CLAUDE.md "아이콘은 lucide-react만" 위반. `--wiki-text-subtlest:#8993a4`는 흰 배경 대비 ~3.2:1로 본문 텍스트 4.5:1 미달(WCAG 1.4.3), 깨진 이미지 보조 텍스트(.image-view-broken)에 적용됨.

---

## 화면별 findings

### A. 글로벌 셸 — 헤더 (`화면.png`, `사이드바 및 헤더 참고.png`)

- **[Important] 헤더 우측 액션군 캡처와 불일치.** 캡처: 앱그리드(⋮⋮) · 로고 · 중앙검색(단축키 힌트 아이콘 포함) · 만들기 · **Rovo에게 질문하기 · 알림 벨 · 도움말(?)** · 아바타. 현재(WikiTopBar.tsx): 토글 · WIKI · 검색 · 만들기 · **다크모드 Switch** · (로그아웃) · 아바타. 앱그리드·Rovo·알림·도움말 없음(셸설계 후속), 그 자리에 캡처에 없는 다크모드 Switch가 노출. → 다크 토글은 아바타/설정 메뉴 안으로 넣는 게 캡처 정합(제품 기능이라 존치 자체는 허용, 위치만).
- **[Minor] 사이드바 토글 글리프.** `⧉` 텍스트(WikiTopBar.tsx:55) 대신 lucide `PanelLeft`. 캡처 좌상단 아이콘과 형태·정렬이 맞고 lucide-only 규약도 지킴. `aria-label="사이드바 토글"`은 정합.
- **[Minor] 브랜드.** 캡처는 로고 이미지(dmove/Confluence), 현재는 텍스트 "WIKI". 클론 대체로 허용 — 후속 확인.
- 검색 배치·`searchPlaceholder="검색"`·만들기 컨텍스트 분기(스페이스 안=드롭다운/밖=버튼)는 **정합**.

### B. 글로벌 셸 — 좌측 사이드바 (`사이드바 및 헤더 참고.png`, `특정 스페이스 페이지.png`)

- **[Important] 글로벌 네비 최근/별표/앱이 죽은 자리표시.** GlobalSidebar.tsx:96~118에서 `disabled` 버튼. 캡처는 셋 다 플라이아웃으로 동작(`home1최근항목.png`=최근 목록, `home2스페이스.png`=스페이스 필터). 셸설계 §3-4 후속이나, 그 전까지는 키보드 사용자에게 도달 불가한 회색 항목만 남음(Nielsen #1 가시성 · 아래 접근성 항목 참조).
- **[Important] 사이드바 푸터 전무.** 캡처 하단: `Jira`·`팀`(외부링크 ↗ 아이콘) + `더 보기`. 현재 없음. 일관 셸(휴리스틱 #4)로서 캡처의 3단 구조 중 3단(푸터)이 빠짐.
- **[Important] 스페이스 컨텍스트 구성이 캡처와 다르다.** 캡처(`특정 스페이스 페이지.png`) 스페이스 사이드바: [아이콘+스페이스명 …] · **바로 가기(+)** · **콘텐츠(체크·+ 아이콘 헤더)** + 페이지 트리 + 제목검색 · **만들기** · 블로그 · 캘린더 · 스페이스 앱. 현재(GlobalSidebar.tsx:123~200): 스페이스 헤더 + (별표 스페이스 목록) + "모든 스페이스 보기" 링크 + 제목검색 + PageTree만. → "바로 가기", "콘텐츠" 라벨 헤더+추가버튼, "만들기" 버튼, 블로그/캘린더/앱 없음(후속). 
- **[Important] 스페이스 안에 "별표 표시된 스페이스" 오노출.** GlobalSidebar.tsx:161~178은 스페이스 컨텍스트에서도 별표 목록을 렌더. 캡처의 스페이스 사이드바는 순수 스페이스 스코프(별표 스페이스 목록은 홈/디렉토리 컨텍스트에만). → 스페이스 안에서는 제거해 캡처와 맞춘다.
- **[Minor] 별표 스페이스 항목에 아이콘 없음.** 현재 `{name} ({key})` 텍스트 버튼(GlobalSidebar.tsx:171). 캡처는 스페이스 색 아이콘 + 이름. lucide/Avatar로 아이콘 선행.
- 접힘 상태 localStorage 유지, `position:relative` 기준 SidebarResizer, 트리 검색은 **정합**.

### C. 홈 대시보드 (`home0.추천항목.png`, `home1.png`)

- **[Important] "최신 업데이트 살펴보기" 피드 미구현.** 캡처: 섹션 제목 + 탭 pill(팔로우 항목/인기 항목/캘린더) + `정렬 기준: 관련성` 드롭다운 + `피드 편집` + 안내 배너(일러스트+닫기) + 활동 카드(아바타·이름·"1번 업데이트됨"·날짜·"최근 작업" 태그·문서 제목·소유자·발췌·이모지 반응). 현재 HomePage.tsx는 "이어서 작업" 한 섹션에서 종료. (셸설계/홈설계 후속이나 캡처 대비 절반 누락 — 무음 아님으로 명시.)
- **[Minor] 이어서 작업 카드 레이아웃.** 캡처: 문서아이콘 + 제목 + **스페이스명(별도 줄)** + "방문 20분 전", 일부 카드 `임시본` 배지. 현재(HomePage.tsx:66~69)는 `스페이스 · 방문 …`를 한 줄 meta로 합침, 배지 없음. 3열 그리드·hover 카드·EmptyState는 정합.
- **[Minor] 섹션 제목 문구.** 현재 "마지막 작업하던 곳에서 다시 시작"(HomePage.tsx:48) vs 캡처 "마지막 작업**을** 하던 곳에서 다시 시작".
- 로딩 Spinner·빈 상태 EmptyState(Nielsen #1) **정합**.

### D. 스페이스 디렉토리 (`space 페이지.png`)

- **[Important] "자주 찾는 스페이스" 카드 시각 드리프트.** 캡처: 정사각 브랜드 색 아이콘(상단 큰 타일) + 이름 + **별표 우상단**, 섹션 헤더 우측 **"자세히 표시"** 링크, 고정 6열 한 줄. 현재(SpaceDirectoryPage.tsx:82~112): 원형 Avatar + 이름 + **행 끝 별표**, `auto-fill minmax(240px)` 반응형. → 별표 위치·아이콘 형태·자세히표시 링크 불일치.
- **[Important] "모든 스페이스" 필터 컨트롤 누락.** 캡처: 제목필터 input + `모든 분류` 드롭다운 + `모든 필터` 드롭다운. 현재는 제목 필터 input만(SpaceDirectoryPage.tsx:117). (분류/필터 실동작은 후속이나 컨트롤 자리라도 캡처 정합 필요 — 무음 누락 금지 §4.3.)
- **[Minor] 테이블 Actions 열 축소.** 캡처 Actions: 눈(미리보기)·별표·⋯(오버플로) 3개. 현재는 별표 1개(SpaceDirectoryPage.tsx:56~72). Labels/Owner가 "—"/"Not available"인 것은 백엔드 필드 부재로 설계 §1.3에 문서화됨 — **정합(데이터 갭)**.
- 테이블 채택 자체(Stage3 카드→테이블 복원), DS `Table` 재사용, row-name 클릭 이동은 **정합**.

### E. 스페이스 개요 (`특정 스페이스 페이지.png`)

- **[Important] 스페이스 개요 페이지 부재.** 캡처: 개요(이모지 헤더) + 최근 작업 콘텐츠 + 최근 업데이트 목록 + 블로그 스트림 + 연락처. 현재 SpaceIndexPage.tsx는 첫 루트 페이지로 `Navigate` 리다이렉트(또는 빈 EmptyState)만. (셸설계 §3-5 후속 — 캡처 대비 화면 자체가 없음으로 명시.)

### F. 에디터 (`에디터.png`)

- **[Minor] 제목/작성자 정렬.** 캡처: 본문 컬럼 중앙에 큰 제목 "페이지 제목 지정" + "작성자 Tom Kim" 라인 + placeholder "요소를 삽입하려면 /를 입력하세요". 현재는 좌측 정렬 제목(760px 중앙 컬럼) — 컬럼 정렬은 근사하나 작성자 메타 라인이 편집 화면에 없음.
- **[Minor] `.page-edit-title font-size: 2rem` 하드코딩**(app.css:910). 최대 토큰 `--chanho-font-size-400`으로 대체(타이포 스케일 이탈).
- **[Minor] 하단 템플릿 퀵인서트 카드**(캡처: 한 주 상태보고서/회의록/프로젝트 계획/표/정보 패널/목차 등) 없음 — 후속.
- 상단 고정 크롬(.edit-chrome) + sticky 툴바 + 슬래시/버블/삽입 메뉴는 캡처 툴바 그룹과 **대체로 정합**(단, 툴바 버튼 배경 active가 `--wiki-chip-*`=DS 갭 토큰 사용, 아래 참조).

### G. 버전 기록 (`버전기록.png`)

- **[Minor] 인터랙션 패턴 차이.** 캡처: 우측 도킹 "버전 기록" 패널(월 그룹핑 `2025년 12월`, V3/V2/V1 행, `현재` 배지, 아바타+이름, ⋯). 현재는 HistoryModal(중앙 다이얼로그, app.css:959 `.history-modal`). 기능은 존재하나 도킹 패널 vs 모달로 시각/맥락 유지가 다름 — 캡처 충실도 관점 드리프트(휴리스틱 #3 맥락 유지는 도킹이 유리).

---

## DS 정합 (토큰/하드코딩)

- **[Critical] 팝오버 그림자 하드코딩 5곳** — app.css:1123(.editor-suggestions)·1258(.bubble-toolbar)·1305(.insert-menu-popover)·1367(.space-flyout)·1462(.emoji-picker-popover). `→ var(--chanho-shadow-overlay)`. (다크모드 소실 = 상단 #1.)
- **[Minor] `.page-edit-title font-size: 2rem`**(app.css:910) → 폰트사이즈 토큰.
- **[Minor] `.wiki-chip` border-radius:4px / padding:0 4px 하드코딩**(app.css:1185~1188) → `--chanho-radius-small` / space 토큰. (다른 곳은 폴백 병기 중.)
- **[Minor] 매직 넘버**: `.top-toolbar` gap 2px·min-width 30px·divider height 18px(app.css:1199·1219·1242), `.bubble-toolbar` gap 2px(1254), `.code-block-toolbar` 4px(1536), `.image-view-broken` padding 16px·radius 6px(1548~1550) — 소수 레이아웃 상수. 토큰화 권장(순수 계산값 아님).
- **[정합/DS 확장 후보]** `--wiki-chip-accent-*`(칩·툴바 active 배경/글자)와 `--wiki-hljs-*`(코드 하이라이트)는 DS에 대응 토큰이 없어 저장소 전용 `--wiki-*`로 둔 것이며 다크 값·WCAG 대비까지 계산됨(app.css:10~39). 위반 아님 → **DS 확장 후보**(디자인시스템 리포에 semantic 승격 검토).
- **[Minor] 텍스트 글리프 아이콘** `⧉`(WikiTopBar.tsx:55), `★/☆`(SpaceDirectoryPage.tsx·SpaceFlyout) — lucide-only 규약 위반. `PanelLeft`, `Star`(fill 상태)로. (상단 #5.)

## 접근성 (WCAG 2.2 AA)

- **[Important] 저대비 보조 텍스트.** `--wiki-text-subtlest:#8993a4` on `#fff` ≈ 3.2:1 < 4.5:1(1.4.3). placeholder는 관대하나 `.image-view-broken`(app.css:1552) 보조 **본문 텍스트**에 적용 → 실패. 다크 값(#7e8898)은 주석상 4.97:1로 통과. 라이트 값 상향 필요.
- **[Minor] disabled 네비 항목의 인지 부담**(GlobalSidebar.tsx:96~118). `disabled` 버튼은 탭 순서에서 빠지고 이유 설명이 없어 키보드/스크린리더 사용자에겐 "죽은 회색 항목". 구현 전까지 숨기거나 "준비 중" 접근 텍스트 병기(Nielsen #1).
- **[Minor] 포커스 링 불일치.** page-tree·history-item·home-resume-card·code-copy·resizer는 `box-shadow: var(--chanho-focus-ring)` 적용(정합). 반면 `.global-nav-item`·`.space-switcher-trigger`·`.wiki-sidebar-starred-item`·`.space-directory-row-name`·`.space-directory-star`·`.space-directory-card-name`은 전용 focus-visible 규칙 없이 UA 기본 아웃라인 의존(=가시성 자체는 유지되나 DS 링과 불일치). 통일 권장.
- **[정합]** 아이콘 버튼 `aria-label`(사이드바 토글·더 보기·전체 너비·별표), 별표 `aria-pressed` + ★/☆ 형태 병행(색만으로 상태 구분 아님 — 1.4.1 통과), 스페이스 플라이아웃 `aria-haspopup="dialog"`/`aria-expanded`, 트리 키보드 조작·포커스 링은 잘 지켜짐.

## 시각 완성도 / 다크모드

- **[정합]** 로딩(Spinner)·빈(EmptyState)·에러(App 레벨 재시도) 상태가 침묵하지 않음(Nielsen #1). 간격/타이포/트리 리듬 대부분 토큰 기반. 다크모드는 `[data-theme="dark"]` 셀렉터 + semantic 토큰 매핑으로 일관(팝오버 그림자만 예외 — Critical #1).
- **[Minor]** 사이드바 배경 `background-subtle`(면 구분), 트리 hover/active, 코드블록 다크 배경 대비 계산 등은 문서화·정합.

---

## 후속(레퍼런스 있으나 미구현 — 무음 누락 금지, §4.3)

앱그리드 · Rovo · 알림/도움말(헤더) · 최근/별표/앱 플라이아웃 · 사이드바 푸터(Jira/팀/더 보기) · 스페이스 컨텍스트(바로 가기/콘텐츠 헤더/만들기/블로그/캘린더/앱) · 홈 "최신 업데이트" 피드 · 디렉토리 분류/필터 드롭다운·자세히 표시·Actions(눈/⋯) · 스페이스 개요 페이지 · 에디터 템플릿 퀵인서트 · 버전기록 도킹 패널. 대부분 `2026-07-22-confluence-shell-design.md` §3-4~5에 후속으로 선언됨.
