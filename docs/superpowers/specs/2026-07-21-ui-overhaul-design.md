# 위키 UI 개선 (Atlassian 정렬) — 설계 문서

작성 2026-07-21. 사용자 요청: Confluence 클론 위키 UI를 Atlassian 팔레트 기준으로 개선.
3단계(토큰 → 공통 컴포넌트 → 화면), 각 단계 끝나면 멈추고 리뷰.

> **진행 모드 주의**: 사용자가 "알아서 작업해둬"로 자율 위임 + "각 단계 끝나면 멈추고 보여줘"를 함께 지시.
> 그래서 **Stage 1을 끝까지 구현·검증**하고 **Stage 2 착수 전 정지**한다. 이 문서는 사후 승인용 설계 기록이다.

## 탐색으로 드러난 재구성 (요청 전제 vs 실제)

- **디자인 시스템은 별도 git 리포**(`C:/MSA_TEMPLATE/design-system`, pnpm 모노레포)이고, wiki-front는 빌드된 **`.tgz` 타르볼**로 소비한다(`artifacts/`). 토큰/컴포넌트 수정 = DS 소스 수정 → 빌드 → 타르볼 재패키징 → wiki-front 버전 재지정 → install. **타르볼 버전이 소비자를 격리**하므로 새 버전으로 올려도 alm-front(구 버전 핀)는 영향 없음 → 야간 자율 작업이 안전·가역적.
- **요청한 "새 공통 컴포넌트" 대부분이 이미 존재**: Avatar, Badge, Tooltip, Dropdown, Modal(=Dialog), EmptyState, Tag/Lozenge 모두 DS에 있음(28개 컴포넌트). Button도 `subtle`/`danger` 변형 보유. → Stage 2는 "신규 구축"이 아니라 **격차 보완**(아이콘 버튼 변형, Avatar 이니셜+색상 확인)으로 축소.
- **현 브랜드는 "스틸 블루" #1B66C9** — Atlassian #0C66E4 아님. Stage 1이 이걸 정렬.
- **wiki-front 스타일은 단일 전역 파일** `src/app/app.css`(1534줄). CSS Modules/인라인 없음. 하드코딩 hex 47개 전부 app.css이며 대부분 `var(--chanho-…, #fallback)` 폴백 + 승인된 `--wiki-*` 커스텀(hljs 구문색·칩 강조색). → 규칙 위반 아님, Stage 3에서 정리.
- **아이콘 라이브러리 없음**. 에디터 툴바는 유니코드 글리프(B I S <> 🔗 …), 사이드바만 인라인 SVG. 사용자가 lucide-react 추가 허용 → Stage 3에서 도입.

## 토큰 아키텍처 (건드리지 않는 계약)

3계층: `palette.ts`(원시 램프) → `semantic.ts`(light/dark 시맨틱, **키 세트 동일 강제** — buildCss.test.ts) → `static.ts`(space/radius/font/z/focus). 빌드(`build.ts`)가 `:root`(정적+light) + `[data-theme="dark"]`(dark) CSS 변수(`--chanho-*`)로 방출. 다크모드 = `data-theme` 속성 토글. Stylelint가 컴포넌트 CSS의 하드코딩 색을 금지.

## Stage 1 — 토큰 정비 ✅ 구현·검증 완료

**전략**: 시맨틱 매핑은 이미 Atlassian 구조와 동형이므로 **원시 램프 값만 재조정**하면 목표값이 기존 시맨틱 키를 통해 그대로 흘러나온다. semantic.ts 무수정.

변경 파일(design-system):
- `palette.ts`: `blue` → Atlassian 블루(500=#0C66E4), `gray` → Atlassian 라이트 뉴트럴(900=#172B4D 텍스트, 500=#626F86 보조, 200=#DCDFE4 경계, 50=#F7F8F9 사이드바, 100=#F1F2F4 호버, blue.50=#E9F2FF 선택), `darkGray` → Atlassian 다크 뉴트럴(100=#1D2125 배경, 0=#161A1D 사이드바). red/green/orange/teal는 유지(요청 범위 밖).
- `static.ts`: `radius.medium` 8px→**6px**(app.css가 이미 `var(--chanho-radius-medium, 6px)` 폴백으로 기대하던 값 — 잠재 불일치 해소 겸), 신규 `transition` 그룹(fast 100ms / **base 150ms** / slow 250ms, 값에 `ease` 포함해 `transition: <prop> var(--chanho-transition-base)`로 직접 사용).
- `build.ts` / `index.ts`: `transition` 방출·export 배선.

**목표값 → 시맨틱 키 매핑(모두 기존 키로 적중)**:
| 요청 | 값(light/dark) | 시맨틱 키 |
|---|---|---|
| primary | #0C66E4 / #388BFF | `color.background.brand` |
| 텍스트 | #172B4D / #DEE4EA | `color.text.default` |
| 보조 텍스트 | #626F86 / #9FADBC | `color.text.subtle` |
| 경계선 | #DCDFE4 / #38414A | `color.border.default` |
| 사이드바 배경 | #F7F8F9 / #161A1D | `color.background.subtle` |
| 호버 | #F1F2F4 / #282E33 | `color.background.neutral` |
| 선택 배경 | #E9F2FF / #082145 | `color.background.selected` |
| 본문 배경 | #FFFFFF / #1D2125 | `color.background.default` |

**릴리스 워크플로 (재현용)**:
```
cd design-system/packages/tokens
# (소스 수정 후)
pnpm typecheck && pnpm test && pnpm build
# package.json version 0.2.0 → 0.3.0
pnpm pack --pack-destination ../../artifacts        # → chanho-tokens-0.3.0.tgz
# wiki-front:
#   package.json  @chanho/tokens → 0.3.0.tgz
#   pnpm-workspace.yaml overrides @chanho/tokens → 0.3.0.tgz   ← 둘 다 고쳐야 함!
pnpm install
```
> **함정**: wiki-front는 타르볼 버전을 **package.json + pnpm-workspace.yaml `overrides` 두 곳**에서 핀한다. override가 우선하므로 package.json만 고치면 반영 안 됨(이번에 확인).

**검증**: DS 토큰 typecheck ✓ / test 4 ✓ / build ✓. 방출 CSS 값 확인 ✓. wiki-front typecheck ✓ / **test 420 ✓**.

## Stage 2 — 공통 컴포넌트 정비 (착수 전, 계획)

DS 실측 후 확정하되 현재 계획:
- **Button**: primary/subtle/danger 이미 존재 확인 → 문서·상태(hover/active/focus-visible) 점검. **아이콘 전용 버튼 변형**(정사각, 아이콘만) 신규 — 헤더의 히스토리/전체너비 등에 사용.
- **Avatar**: 이니셜+결정론적 배경색 지원 여부 확인, 없으면 확장.
- **Tooltip/Dropdown/Modal/Badge/EmptyState**: 존재 → 필요한 props(예: Dropdown 메뉴 아이템 아이콘, 구분선) 격차만 보완.
- 모든 인터랙션 요소에 hover/active/focus-visible 상태 일관화(transition 토큰 사용).
- 변경 시 tokens와 동일한 재패키징 루프(react 0.3.0 → 0.4.0).

## Stage 3 — 화면별 적용 (착수 전, 계획)

app.css + 컴포넌트 배선 중심. 사이드바(260px·트리 32px·chevron 회전·문서 아이콘·스페이스 Avatar), 페이지 헤더(브레드크럼브 12px·메타 한 줄·편집만 primary·나머지 아이콘버튼+Tooltip·삭제는 … Dropdown+confirm Dialog), 본문(760px 중앙·코드블록 복사·표 헤더/행 호버), 스페이스 목록(Table→카드 그리드·상단 한 줄·EmptyState), 에디터(lucide 아이콘 세트·그룹 구분선·슬래시 메뉴 아이콘/키보드 내비/하이라이트·저장 바 로딩). lucide-react 도입.

## 열린 결정 (사용자 리뷰 대기)

1. **lucide-react 도입 위치**: wiki-front 직접 의존(권장, DS는 아이콘 라이브러리 비의존 유지) vs DS에 아이콘 래퍼. — CLAUDE.md 불변조건 #4("UI 100% @chanho")와의 관계 확인 필요.
2. **radius.medium 8→6px**가 DS의 다른 소비자(alm-front)엔 새 타르볼을 안 올리는 한 무영향. 의도대로 6px 확정?
3. **red/green/orange/teal 상태색**도 Atlassian 정렬할지(현재는 유지).
4. Stage별 정지 리듬 유지 여부(현재 그렇게 진행 중).
