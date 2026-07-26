# wiki-front 디자인 재검토 2 — 사용자 3대 불만 정밀 점검 (디렉토리 · 에디터 · 폴더/페이지 구분)

작성 2026-07-25 (디자이너 롤). 스펙 = 사용자 제공 컨플루언스 캡처(`space 페이지.png`, `에디터.png`, `특정 스페이스 페이지.png`, `사이드바 및 헤더 참고.png`). 렌즈: `product-design` 스킬(Nielsen · WCAG 2.2 AA · 토큰 3계층 · §4 충실 복제). **검토 전용 — 코드 무수정.** 근거 표기: 캡처명 / 토큰 / WCAG / 파일:라인.

> **직전 리뷰(2026-07-22) 대비 이미 처리된 항목** — 재지적하지 않는다:
> - 팝오버 그림자 하드코딩 5곳 → 전부 `var(--chanho-shadow-overlay)`로 교체됨(app.css:1166·1301·1348·1410·1505). 다크모드 소실 해소. **정합.**
> - `--wiki-text-subtlest` 라이트 값 `#8993a4`(3.1:1) → `#626f86`(≈5.08:1)로 상향(app.css:13). WCAG 1.4.3 통과. **정합.**
> 본 리뷰는 사용자가 콕 집은 3가지(①디렉토리 ②에디터 ③폴더/페이지 구분)에 집중한다.

---

## 가장 먼저 고칠 5개 (디자인 임팩트 순)

1. **[Important · ②] 에디터 툴바/크롬이 760px로 쪼그라들어 떠 있다.** `.page-edit max-width:760px`(app.css:939)가 편집 크롬 + 제목 + 툴바 + 본문을 **전부** 감싼다 → sticky 상단 툴바(`.top-toolbar`)가 화면 폭이 아니라 760px 좁은 폭으로 가운데 떠 있다. 캡처(`에디터.png`)의 편집 툴바는 **화면 폭 전체(엣지-투-엣지)**로 깔리고, 제목+본문만 좁은 읽기 컬럼이다. → 크롬·툴바는 풀폭 sticky 바로 빼고, `max-width:760`은 제목 input + ProseMirror 본문을 감싸는 **안쪽 래퍼**에만 건다. "구성이 이상하다"의 최대 원인.
2. **[Important · ③] 폴더(하위 있는 페이지)와 말단 페이지가 아이콘상 동일.** PageTree.tsx:180이 **모든** 노드에 `FileText` 하나만 렌더 → 하위 있는 항목과 없는 항목이 셰브론 유무로만 갈린다. 캡처(`특정 스페이스 페이지.png`)는 하위 있는 항목에 **폴더 아이콘**(ELK·온보딩 교육·rms), 말단에 **문서 아이콘**을 쓴다. → has-children 노드는 lucide `Folder`(펼침 시 `FolderOpen`), 말단은 `FileText`.
3. **[Important · ①] "모든 스페이스" 테이블 이름이 파란 링크 — 캡처는 검정 텍스트.** `.space-directory-row-name { color: var(--chanho-color-text-brand) }`(app.css:1714) + hover 밑줄(1718) → 표 전체가 하이퍼링크 목록처럼 보인다. 캡처의 스페이스명은 근검정(`text-default #172B4D`)이다. → `color: var(--chanho-color-text-default)`로.
4. **[Important · ②] 편집 크롬에 제목이 두 번 크게 노출된다.** `.edit-chrome-title`(16px semibold, app.css:981) 바로 아래 `.page-edit-title`(2rem)이 같은 제목을 반복 → 큰 제목이 위아래로 겹쳐 보인다. 캡처의 좌상단 제목은 문서 아이콘 + 작은 브레드크럼(회색)일 뿐이다. → 크롬 제목을 브레드크럼(문서 아이콘 + `font-size-75`~`100`, `text-subtle`)으로 축소, 저장 상태("저장됨"/미저장) 표시 추가.
5. **[Important · ①] 디렉토리 상단 컨트롤·폭·타이포가 캡처와 다르다.** "자주 찾는 스페이스" 우측 **"자세히 표시"** 링크 부재, "모든 스페이스"에 **`모든 분류`·`모든 필터` 드롭다운** 부재(현재 제목 필터 input만, SpaceDirectoryPage.tsx:122~127), 본문 폭 960px로 캡처 대비 좁아 테이블·카드 리듬이 답답, h1 "스페이스"는 토큰 미적용(UA 기본 2em). → 컨트롤 복원 + 폭 확대(≈1040) + h1 토큰화.

---

## ① 스페이스 디렉토리 (`/spaces`) — `space 페이지.png`

> 사용자 지적: "자주 찾는 스페이스" 카드는 캡처대로 재설계됐으나 **페이지 전체 인상·"모든 스페이스" 테이블·간격·타이포·정렬**이 여전히 별로.

- **[Important] 테이블 이름 = 파란 링크 (캡처는 검정).** `.space-directory-row-name` `color: text-brand`(app.css:1714) + hover 밑줄. 캡처 스페이스명은 검정 본문색. → `color: var(--chanho-color-text-default)`, hover는 밑줄만 유지(또는 `text-subtle`). 표가 "링크 더미"가 아니라 콘텐츠 목록으로 읽힌다.
- **[Important] "모든 스페이스" 필터 컨트롤 누락.** 캡처: `제목으로 필터링` input + `모든 분류 ▾` + `모든 필터 ▾` 3개 한 줄. 현재는 `TextField` 하나(SpaceDirectoryPage.tsx:122). → DS `Select`(또는 DropdownMenu 트리거) 2개를 input 우측에 나란히. **주의:** 백엔드가 labels/분류를 안 줘서 실제 필터는 죽은 컨트롤이 된다(설계 §1.3) → **후속**으로 분리하되, "죽은 자리표시 지양" 원칙상 백엔드 필드가 붙기 전까지는 **넣지 않고 후속으로 명시**하는 편이 낫다(무음 누락 금지 §4.3 — 여기 기록으로 갈음). 캡처 정합만 위해 비활성 드롭다운을 깔지 말 것.
- **[Important] "자세히 표시" 링크 부재.** 캡처: "자주 찾는 스페이스" 섹션 헤더 **우측 끝**에 `자세히 표시` 텍스트 링크. 현재 h2만(SpaceDirectoryPage.tsx:83). → 섹션 헤더를 `display:flex; justify-content:space-between`로, 우측에 DS `Link`/텍스트 버튼. (동작 대상 화면 없으면 후속 — 자리라도 캡처 정합.)
- **[Important] 본문 폭·리듬.** `.space-directory-content max-width:960px`(app.css:1627). 캡처 디렉토리는 사실상 콘텐츠 풀폭(테이블이 Space name↔Labels↔Owner↔Actions로 여유 있게 벌어짐)이고 "자주 찾는" 카드가 **고정 6열 한 줄**. 960px + `minmax(180px,1fr)`(1648)에선 카드가 5열로 접히고 테이블이 답답하다. → 폭을 홈(`--home` 1040)과 맞춰 ≈1040~1200으로, 카드는 캡처의 6열 밀도에 근접시킨다(반응형 유지 주석 1641은 존중하되 상한을 6열로).
- **[Minor] h1 "스페이스" 타이포 토큰 미적용.** `.space-directory-content h1` 전용 규칙이 없어 UA 기본(2em bold)에 의존. 캡처 h1은 ≈24px semibold. → `font-size: var(--chanho-font-size-400)` + `font-weight: var(--chanho-font-weight-semibold)`. 섹션 h2(font-size-200, 1636)는 정합.
- **[Minor] 테이블 Actions 열 축소.** 캡처: 눈(미리보기)·별표·⋯(오버플로) 3개. 현재 별표 1개(SpaceDirectoryPage.tsx:56~72). → 미리보기/⋯는 동작 대상 없으면 **후속**. 별표 자체(형태로 상태 구분, `Star` fill)는 정합.
- **[정합]** 카드 = 정사각 아이콘 타일(좌상) + 별표(우상) + 이름 세로 배치(SpaceDirectoryPage.tsx:87~114 / app.css:1653~1698), Avatar radius 오버라이드로 정사각화(1677), 카드 hover 그림자 `--chanho-shadow-100`(1667), 별표 `aria-pressed`+fill 형태 구분(WCAG 1.4.1) — **정합**(직전 재설계 반영됨).
- **[정합/데이터 갭]** Labels `—` / Owner `Not available`(50·54) — 백엔드 필드 부재, 설계 §1.3 문서화. **정합.**

## ② 페이지 편집 (`/spaces/:id/pages/new`·`/edit`) — `에디터.png`

> 사용자 지적: 제목·툴바·편집 크롬·본문 컬럼 배치가 이상.

- **[Important] 툴바/크롬이 본문 컬럼(760px) 안에 갇혀 좁게 떠 있다.** 구조: `.page-edit`(max-width:760, 가운데, app.css:939) → `edit-chrome` + `page-edit-title` + `WikiEditor`(그 안에 sticky `.top-toolbar`). 즉 크롬 바와 툴바가 760px 폭으로만 그려진다. 캡처는 툴바가 **화면 폭 전체**로 깔리고 제목/본문만 좁은 컬럼. → 레이아웃 재구성: `edit-chrome`·`top-toolbar`는 `.page-edit` 밖(또는 풀폭 래퍼)에서 풀폭 sticky, `max-width:760`은 제목 input + `.ProseMirror`만 감싸는 안쪽 컬럼에. (`--edit-chrome-height` sticky 오프셋 계약은 유지.) **핸드오프 주의:** 두 sticky 바가 같은 스크롤 컨테이너(`.wiki-content`) 안에 있는 현재 계약(app.css:2~4·1248~1250)을 깨지 않도록 z-index/top 오프셋 유지.
- **[Important] 제목 중복 노출.** `.edit-chrome-title`(flex:1, 16px semibold, app.css:981~990)이 바로 아래 `.page-edit-title`(2rem, 953)과 같은 제목을 크게 반복. 캡처 좌상단은 `⌄` + 문서 아이콘 + **작은** "제목 없음" 브레드크럼(회색). → 크롬 제목을 브레드크럼화(`font-size-75/100`, `color:text-subtle`, 앞에 `FileText` 16px). 큰 제목은 본문 h1 하나로.
- **[Important] 저장 상태 비가시(Nielsen #1).** 캡처 우상단 `저장됨` 오토세이브 표시 → 현재 크롬에 저장/미저장 상태 없음. 본 저장 모델은 명시 저장(`업데이트` 버튼)이라 "오토세이브 저장됨"은 부적합하나, **dirty/저장됨 상태 텍스트**는 유용하다(PageEditPage의 `isDirty()` 이미 존재, 36행). → 크롬 좌측 브레드크럼 옆 `저장 안 됨`/`저장됨` 미세 라벨. (오토세이브 자체는 후속.)
- **[Minor] `.page-edit-title` 하드코딩.** `font-size: 2rem`(app.css:953) → `var(--chanho-font-size-600)`(32px, 동일값), `font-weight: 700`(954) → `var(--chanho-font-weight-bold)`. 타이포 스케일 이탈 제거.
- **[Minor] 작성자 메타 라인 부재.** 캡처: 큰 제목 아래 `작성자 Tom Kim` 라인. 현재 편집 화면엔 없음. → 데이터(작성자) 필요 → **후속**(무음 아님으로 기록).
- **[Minor] 툴바 선두 컨트롤 차이.** 캡처: `글쓰기 | 형식 개선` 탭 + `T 일반 텍스트` 블록 드롭다운(T 아이콘). 현재: undo/redo + 라벨 없는 `select`(TopToolbar.tsx:105~112). → 블록 드롭다운에 `Type`(T) 아이콘/현재 블록명 표기로 근접. (탭 2종은 로드맵 밖 — 후속.)
- **[Minor] 툴바 매직 넘버.** gap 2px(app.css:1242)·min-width 30px(1262)·divider height 18px(1284)·select padding 2px 4px(1278) — 순수 계산값 아님, 토큰화 권장.
- **[정합]** 툴바 그룹핑·divider·아이콘 버튼 `aria-label`+`title`+`aria-pressed`(TopToolbar.tsx:84~101), lucide-only, `is-active` 배경은 `--wiki-chip-accent-*`(DS 갭 승인 토큰, 다크·대비 계산됨), sticky 오프셋 `--edit-chrome-height` — **정합**. 본문 컬럼 좌측 정렬(캡처와 일치, 중앙정렬 아님)도 **정합**(직전 리뷰 우려 무효).

## ③ 폴더 vs 페이지 구분 (사이드바 트리) — `특정 스페이스 페이지.png`, `사이드바 및 헤더 참고.png`

> 사용자 지적: 하위 있는 페이지(폴더 역할)와 말단 페이지가 시각적으로 구분 안 됨.

**현 상태(PageTree.tsx):** 모든 노드가 `FileText` 아이콘 동일(180행). 하위 있으면 앞에 셰브론 토글(164~175행), 없으면 빈 24px 스페이서(177행). → **구분 신호가 셰브론 유무 하나뿐**이고 아이콘은 완전 동일.

**캡처 패턴:** 하위 있는 항목 = 확장 셰브론(`>`) + **폴더 아이콘**(ELK·온보딩 교육·rms). 말단 = 앞에 작은 **불릿 점(•)** + 문서/이모지 아이콘. (`에디터.png` Tom 스페이스는 전부 말단이라 불릿+문서.)

- **[Important] 폴더/문서 아이콘 미분화.** → has-children 노드는 lucide `Folder`(접힘) / `FolderOpen`(펼침), 말단은 `FileText`. PageTree.tsx:180의 단일 `FileText`를 `children.length > 0 ? (isCollapsed ? Folder : FolderOpen) : FileText`로. 색은 현행 `.page-tree-icon { color: text-subtle }`(app.css:452) 유지 — 캡처의 폴더 회색톤과 맞고, **하드코딩 노랑 금지**.
- **[Important] 말단 불릿 마커 부재.** 말단은 현재 빈 스페이서(177행)라 들여쓰기만 되고 앞 마커가 없음. 캡처는 말단 앞 `•`. → 스페이서 자리에 `--chanho-color-text-subtle` 작은 점(순수 CSS `::before` 또는 4px dot). 폴더=셰브론 / 말단=불릿로 **한눈에 위계**가 서고 캡처 리듬과 일치.
- **[WCAG 1.4.1] 색-단독 아님 확인.** 현행 구분은 셰브론(형태)이라 색 단독 위반은 **아니다**. 다만 아이콘까지 분화하면(폴더 vs 문서) 형태 신호가 이중이 되어 인지 부담이 줄고 캡처 충실도가 오른다. → 아이콘 분화는 접근성 위반 수정이 아니라 **충실 복제 + 명료성** 개선.
- **[데이터 모델 한계 — 반드시 명시]** 우리 모델은 `Page.parentId` 트리이고 **별도 folder 엔티티가 없다**(store/types의 `Page`). 따라서 "폴더" = "지금 하위를 가진 페이지"일 뿐이다. 귀결:
  - 폴더/말단 어피어런스가 **하위 추가·삭제에 따라 바뀐다**(마지막 자식을 지우면 폴더 → 문서로 변신). 컨플루언스의 진짜 "폴더"는 본문 없는 컨테이너 콘텐츠 타입이라 이를 정확히 복제할 수 없다 — 우리 "폴더"는 여전히 클릭하면 본문이 열리는 **네비게이션 가능한 페이지**다.
  - 권장: `Folder` 아이콘은 순수 **has-children 어피어런스**로만 쓰고(클릭=페이지 열림 유지), "본문 없는 컨테이너"로 오해하게 만들지 않는다. 백엔드가 folder/컨테이너 타입을 도입하면 재검토. → **후속(백엔드 정책)** 으로 기록.
- **[정합]** 셰브론 `aria-expanded`(168행) + 회전 트랜지션(app.css:423), 추가 버튼 `aria-label`(187행) hover-reveal, 들여쓰기 `space-200`(389), 포커스 링 `--chanho-focus-ring`(516), 키보드 조작 — **정합**. 폴더 노드에 셰브론 상시 노출(opacity 미적용)도 캡처와 **정합**.

---

## DS 정합 / 하드코딩 (본 리뷰 3화면 범위)

- **[Minor]** `.page-edit-title font-size:2rem` / `font-weight:700`(app.css:953~954) → `--chanho-font-size-600` / `--chanho-font-weight-bold`.
- **[Minor]** `.space-directory-content h1` 토큰 미적용(UA 기본) → `--chanho-font-size-400`.
- **[Minor]** 툴바 매직 넘버(app.css:1242·1262·1278·1284) 토큰화.
- **[정합/DS 확장 후보]** `--wiki-chip-accent-*`(툴바 is-active·칩), `--wiki-hljs-*`(코드 하이라이트)는 DS 대응 토큰 부재로 저장소 전용 `--wiki-*`(app.css:14~24), 다크·대비 계산 완료 → 위반 아님, DS semantic 승격 검토 후보. lucide `Folder`/`FolderOpen`은 이미 lucide-react에 존재 — DS 확장 불필요.

## 후속 (레퍼런스 있으나 미구현/데이터 부재 — 무음 누락 금지 §4.3)

- **①:** `모든 분류`·`모든 필터` 드롭다운(백엔드 labels 부재 → 죽은 컨트롤 지양, 백엔드 필드 후 도입) · `자세히 표시` 링크(대상 화면) · 테이블 Actions 눈(미리보기)·⋯.
- **②:** 작성자 메타 라인(작성자 데이터) · 오토세이브 "저장됨" · 하단 템플릿 퀵인서트 카드(캡처 하단) · 툴바 `글쓰기/형식 개선` 탭.
- **③:** 백엔드 folder/컨테이너 타입 도입 시 "본문 없는 폴더" 정식 구분(현재는 has-children 어피어런스로 근사).
