# W7: 프론트 하드닝 — W5/W6 후속 티켓 일괄 처리

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** 백엔드 착수 전 프론트 잔여 티켓(W5/W6 최종 리뷰 트리아지)을 모두 정리하고 수동 스모크까지 마친다. 신규 기능 없음 — 하드닝·접근성·중복 제거·테스트 보강.

**Spec:** 각 항목의 근거는 `.superpowers/sdd/progress.md`의 W5/W6 레저 및 최종 리뷰 트리아지.

## Global Constraints

- 마크다운 저장·스토어·타입·백엔드 계약 동결. **pnpm**. 한국어 문구·주석. 커밋 말미 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 각 태스크 TDD, `pnpm typecheck && pnpm test` 그린 후 커밋, 보고서에 커맨드 로그.
- 기존 348 테스트 그린 유지. 동작 변경은 티켓이 명시한 범위만 (리팩터링 태스크는 동작 무변경이 계약).

---

### Task 1: 팝오버 공용 훅 + EmojiPicker 접근성

**Files:** Create `src/features/wiki/lib/useDismissablePopover.ts`. Modify `InsertMenu.tsx`, `EmojiPicker.tsx`, `WikiLayout.tsx`(SpaceFlyout 배선), `SpaceFlyout.tsx`, `app.css`. Tests: 신규 훅 유닛 + 기존 3곳 팝오버 테스트 그린 + 신규 케이스.

- `useDismissablePopover({ containerRef, triggerRef, open, onClose })`: ① 외부 mousedown → onClose만(포커스 불간섭·preventDefault 금지), ② Escape → onClose + 트리거 포커스, ③ **focusout이 컨테이너 밖으로 나가면 onClose** (Tab-out 갭 — relatedTarget 검사, 포커스 강탈 없음). 3중복 리스너 로직을 이 훅으로 대체 (InsertMenu·EmojiPicker·WikiLayout의 각 구현 제거). Escape 바인딩을 input 한정에서 컨테이너 keydown으로 승격 (내부 어디서든 Escape 동작).
- EmojiPicker ARIA: 그리드 `role="listbox"` → 항목 `role="option"`(li 래핑 또는 role 부여) + aria-selected, 탭은 `role="tablist"/"tab"` + `aria-controls`/`tabpanel` 정합(과하면 tab 롤 제거하고 일반 버튼+aria-pressed로 단순화 — 정합만 지키면 방식 자유, 보고 기록). **화살표 내비**: 그리드에서 ←→ 이동, ↑↓ 행 이동(열 수는 CSS와 일치하는 상수), Enter 선택.
- 트리거 aria-label 보강: WikiLayout 스페이스 트리거 `aria-label="스페이스 전환: {이름}"`.

커밋: `refactor(popover): 공용 dismiss 훅 — 외부클릭/Escape/Tab-out 일원화 + EmojiPicker ARIA·화살표 내비`

### Task 2: 프롭 계약·테스트 하드닝 + 슬래시 엣지

**Files:** Modify `EmojiPicker.tsx`, `SpaceCreateModal.tsx`, `TopToolbar.tsx`, `InsertMenu.tsx`, `slashMenu.ts`. Tests: `TopToolbar.test.tsx` 보강, slashMenu/InsertMenu 신규 케이스.

- 반쪽 제어 방지: controlled 판정을 `openProp !== undefined && onOpenChangeProp !== undefined`로 통일하고, 한쪽만 오면 dev 콘솔 경고(`console.warn`) — 3컴포넌트 동일 패턴. TopToolbar의 `onEmojiPickerOpenChange`·`emojiPickerOpen`도 쌍 검사.
- TopToolbar 테스트 보강: 링크·이미지 버튼 동작(직렬화 확인), InsertMenu→openEmoji 배선(콜백 스파이), 프롭 미배선 시 경고.
- slashMenu openEmoji 분기 직접 테스트 (command 경유 — Editor 인스턴스로 suggestion command 호출).
- **슬래시 패널 줄 중간 가드**: 패널 4종 run이 커서가 블록 시작이 아니면 마커를 블록 맨 앞에 삽입하도록 수정 (`insertContentAt` 블록 시작 위치) — "안내: /note" 시나리오에서 조용한 무변환 제거. 회귀 테스트.
- InsertMenu 필터가 description도 검색 (`filterSlashItems`에 두 번째 인자 또는 InsertMenu 전용 필터).

커밋: `fix(editor): 프롭 쌍 계약·슬래시 줄중간 가드·설명 검색 + TopToolbar 테스트 보강`

### Task 3: `[[` 패턴 소스 상수 통합

**Files:** Modify `src/features/wiki/lib/wikiLinks.ts`(상수 export), `editor/markdown.ts`, `editor/extensions/wikiLink.ts`, `editor/extensions/slashMenu.ts`, `components/TableOfContents.tsx`. Tests: 기존 전부 그린 (동작 무변경 계약) + 상수 일치 유닛 1개.

- `wikiLinks.ts`에 `export const WIKI_LINK_SOURCE = "\\[\\[([^\\[\\]\\n]+)\\]\\]"` (+ 필요 시 미닫힘 버전 `WIKI_LINK_OPEN_SOURCE`). 5곳이 `new RegExp(WIKI_LINK_SOURCE, flags)`로 조립 — 전역 플래그 상태 공유 없음. 각 파일의 로컬 정규식 제거.

커밋: `refactor(links): [[ ]] 패턴 소스 상수 단일화 — 5곳 드리프트 제거`

### Task 4: 다크모드 색상 정비

**Files:** Modify `src/app/app.css`. Tests: 스냅샷성 검증은 지양 — 다크 변수 정의 존재만 CSS 소스 검사 1개(App.w5-width 스타일 패턴), 나머지는 기존 그린 유지.

- 대상: DS에 없는 `--color-*` 폴백 패밀리(wiki-chip, placeholder, image-view-broken, editor-suggestions 등)와 hljs raw hex.
- 방식: `@chanho/tokens`의 실제 토큰(`--chanho-*`)에 다크 값이 있는지 확인 후 — 있으면 토큰 참조로 교체, 없으면 app.css에 자체 변수 블록 정의: `:root { --wiki-... }` + `[data-theme="dark"] { ... }` (theme.ts가 다크 전환에 쓰는 실제 셀렉터를 확인해 그 방식 따를 것). hljs 다크 팔레트는 WCAG AA(4.5:1 이상, 다크 배경 기준) 검증 수치를 보고서에 기록.

커밋: `fix(theme): 다크모드 색상 정비 — 비토큰 hex를 라이트/다크 변수로 승격`

### Task 5: 에디터 내 코드 하이라이팅

**Files:** Modify `editor/extensions/base.ts`(CodeBlock → CodeBlockLowlight), `editor/components/CodeBlockView.tsx`, `app.css`, `package.json`(`@tiptap/extension-code-block-lowlight@^2`, `lowlight`). Tests: CodeBlockView 테스트 유지 + 하이라이트 토큰 존재 1개, 골든 왕복 그린(스키마 언어 attr 유지 확인).

- CodeBlockLowlight로 교체하되 기존 NodeView(언어 셀렉트·복사)는 유지 — `CodeBlockLowlight.extend({ addNodeView })`. lowlight는 common 언어 세트 등록. 에디터 내 `.hljs-*` 토큰은 뷰와 같은 색 변수 재사용 (T4 결과물).
- **중단 조건**: CodeBlockLowlight가 tiptap-markdown 직렬화 또는 NodeView와 충돌해 골든 테스트가 깨지고 우회 불가면 되돌리고 BLOCKED 보고 (컨트롤러가 스킵 결정).

커밋: `feat(editor): 에디터 내 코드 하이라이팅 — CodeBlockLowlight, 뷰와 팔레트 공유`

---

### 최종: 게이트 + 브라우저 스모크 + 압축 리뷰

`pnpm typecheck && pnpm test && pnpm build` → 실 브라우저 스모크(dev 서버 — 드래그 핸들·버블 툴바·사이드바 스크롤/리사이즈·TOC 앵커·다크모드·에디터 하이라이트) → whole-branch review → 머지·푸시.
