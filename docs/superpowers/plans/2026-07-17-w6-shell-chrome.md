# W6: 컨플루언스 크롬 정합 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 컨플루언스 편집 화면 스크린샷(`화면.PNG`, 2026-07-17 사용자 제공)을 기준으로 편집 크롬·삽입 메뉴·스페이스 전환·이모지를 컨플식으로 정합한다.

**Architecture:** W5 기반(TipTap 에디터, SLASH_ITEMS, TopToolbar, 사이드바 3영역) 위에 UI 크롬만 재배치·확장. 마크다운 저장 계약·스토어·백엔드 계약은 계속 동결.

**Tech Stack:** 기존 스택 그대로 (신규 의존성 없음 — 이모지도 유니코드 정적 목록).

**Spec:** `docs/superpowers/specs/2026-07-17-block-editor-design.md` (W6 결정 행 추가됨)

## Global Constraints

- `Page.body` 마크다운 저장·`wikiStore.ts`·`types.ts`·백엔드 계약 동결. 밑줄/글자색/정렬/멘션은 계속 범위 밖.
- **pnpm** 사용. 커밋 말미 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. 문구·주석 한국어.
- 각 태스크: TDD, `pnpm typecheck && pnpm test` 그린 후 커밋. 보고서에 커맨드 로그.
- jsdom 좌표 의존 동작은 통합 테스트 제외 — 로직 유닛 커버.
- 기존 292+ 테스트 그린 유지 (문구 변경 시 해당 테스트 의도 보존하며 갱신).

---

### Task 1: 편집 크롬 컨플식 — 상단 고정 액션 바

**Files:** Modify `src/features/wiki/pages/PageEditPage.tsx`, `src/app/app.css`. Test: `src/app/App.w6-chrome.test.tsx` (신규) + 기존 저장/취소 참조 테스트 갱신.

- 편집 화면 최상단에 고정 바(`.edit-chrome`, sticky top): 좌측 페이지 제목 미리보기(비편집, 현재 title state 반영, 비어 있으면 "제목 없음"), 우측 **"업데이트"**(primary, 기존 저장 로직)·**"닫기"**(subtle, 기존 취소 로직 — dirty confirm 가드 유지).
- 하단 `.page-edit-actions`(저장/취소) 제거. TopToolbar는 액션 바 바로 아래 sticky (겹침 z-index/offset 정리 — `.top-toolbar`의 top을 액션 바 높이만큼).
- 버튼 문구 변경: "저장"→"업데이트", "취소"→"닫기". **기존 테스트 전수 갱신** (App.w2-edit, w5-editor, w5-width 등 — getByRole name 기준. 의도 보존: dirty confirm·본문 불변·너비 토글 시나리오 그대로).
- 너비 토글 버튼은 액션 바 우측(업데이트 왼쪽)으로 이동.
- 신규 테스트: 액션 바 렌더(업데이트/닫기/전체 너비 존재), 업데이트 클릭 → 저장 플로우(토스트·이동), 닫기 dirty confirm.

커밋: `feat(edit): 컨플식 편집 크롬 — 상단 고정 업데이트/닫기 바, 하단 액션 제거`

### Task 2: 툴바 + 삽입 메뉴 (요소 브라우저)

**Files:** Modify `src/features/wiki/editor/extensions/slashMenu.ts` (SlashItem에 `description: string` 추가 + 전 항목 설명 작성), `src/features/wiki/editor/components/TopToolbar.tsx`, `src/app/app.css`. Create `src/features/wiki/editor/components/InsertMenu.tsx`. Test: `InsertMenu.test.tsx` + slashMenu/TopToolbar 테스트 갱신.

- `InsertMenu`: TopToolbar 끝의 **+ 버튼**(aria-label "요소 삽입", aria-expanded) → 팝오버 목록. 각 항목 = 라벨 + 설명 2줄(컨플 요소 브라우저 스타일). 항목 데이터는 `SLASH_ITEMS` 재사용(설명 포함). 필터 입력(상단, placeholder "요소 검색"), Escape/외부 클릭 닫기, 선택 시 `item.run(editor)` 후 닫기 + 에디터 포커스 복귀.
- 슬래시 메뉴 팝업(SuggestionPopup)에도 설명 표시 — `SuggestionPopupProps.items`에 옵션 `description` 추가 (wikiLink 자동완성은 설명 없음 — 조건 렌더).
- TopToolbar에 **링크·이미지·체크박스 목록** 버튼 직접 노출 (기존 chain 커맨드 재사용 — 링크는 BubbleToolbar의 setLink 로직 공유 추출).
- 테스트: 필터/선택 실행(h1 삽입 → 직렬화 확인)/Escape 닫기/설명 렌더. slashMenu 항목 수·순서 테스트에 description 존재 어서션 추가.

커밋: `feat(editor): 툴바 + 삽입 메뉴 — 설명 있는 요소 브라우저, 링크·이미지·체크박스 버튼 노출`

### Task 3: 스페이스 플라이아웃 패널

**Files:** Create `src/features/wiki/components/SpaceFlyout.tsx`, `src/features/wiki/lib/starredSpaces.ts`. Modify `src/features/wiki/components/WikiLayout.tsx`, `src/app/app.css`. Test: `starredSpaces.test.ts`, `SpaceFlyout.test.tsx`, `App.w6-spaces.test.tsx`.

- 사이드바 헤더의 `Select` → **현재 스페이스 이름 버튼**(aria-haspopup, aria-expanded)으로 교체. 클릭 시 사이드바 옆 플라이아웃 패널:
  - 상단 필터 입력(placeholder "스페이스 필터") — 이름/키 부분 일치.
  - "현재" 섹션(현재 스페이스), "별표 표시됨" 섹션, "모든 스페이스" 섹션 — 각 항목: 이름(키) + 별표 토글 버튼(aria-pressed, aria-label "별표").
  - 하단: "스페이스 만들기"(기존 SpaceCreateModal 열기), 항목 클릭 → 해당 스페이스로 이동 + 패널 닫기.
  - Escape/외부 클릭 닫기, 열릴 때 필터 입력에 포커스, 닫힐 때 트리거 버튼으로 포커스 복귀.
- `starredSpaces.ts`: localStorage `wiki.ui.starredSpaces` = spaceId 배열 (pageWidth/sidebarPrefs 패턴 — 예외 안전, 훅 `useStarredSpaces()`). **주의**: 서버 사용자 설정 승격은 backend 요구사항 문서 정책 결정 목록에 한 줄 추가 (페이지 너비 항목과 같은 절).
- 테스트: 별표 토글/저장·복원, 필터, 스페이스 이동, 포커스 관리, 기존 스페이스 전환 테스트(있다면) 갱신.

커밋: `feat(sidebar): 컨플식 스페이스 플라이아웃 — 필터·별표·만들기, Select 대체`

### Task 4: 이모지 피커

**Files:** Create `src/features/wiki/editor/components/EmojiPicker.tsx`, `src/features/wiki/editor/lib/emojiData.ts`. Modify `slashMenu.ts`(항목 추가), `TopToolbar.tsx`(버튼), `src/app/app.css`. Test: `EmojiPicker.test.tsx` + slashMenu 갱신.

- `emojiData.ts`: 정적 유니코드 목록 ~120개, 카테고리 4개(표정, 사람/손, 사물/기호, 자연) + 한국어 검색 키워드(`{ char: "✅", keywords: ["체크", "완료"] }`). 외부 의존성 금지.
- `EmojiPicker`: 팝오버 — 검색 입력(키워드 부분 일치), 카테고리 탭, 그리드 버튼(aria-label=키워드 첫 항목). 선택 → `editor.chain().focus().insertContent(char)` (유니코드 문자 그대로 — 마크다운 안전) + 닫기.
- 진입점 2곳: TopToolbar 버튼(aria-label "이모지"), SLASH_ITEMS "이모지" 항목(선택 시 피커 열기 — run이 UI를 열어야 하므로 SlashItem run에서 처리 불가하면 WikiEditor 콜백 경유, 구현 시 결정해 보고).
- 골든 왕복: 이모지 포함 문단 케이스 1개 추가 (markdown.test.ts — 유니코드 보존).
- 테스트: 검색/카테고리/선택 삽입(직렬화에 문자 포함)/Escape.

커밋: `feat(editor): 이모지 피커 — 유니코드 정적 목록, 슬래시·툴바 진입`

---

### 최종: 게이트 + 브랜치 리뷰

전체 `pnpm typecheck && pnpm test && pnpm build` → whole-branch review (requesting-code-review 템플릿, 최상위 모델) → 픽스 → finishing-a-development-branch.
