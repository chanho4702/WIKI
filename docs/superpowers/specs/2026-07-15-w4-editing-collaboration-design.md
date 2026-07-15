# WIKI Front W4 — 편집 완성도 + 협업 설계 문서

- 작성일: 2026-07-15
- 상태: 승인됨 (구현 계획 수립 전)
- 선행 문서: `2026-07-11-wiki-clone-design.md` (W1~W3 완료 상태 기준)

## 1. 목적과 범위

"컨플루언스 완전복사"라는 장기 목표를 향한 다음 웨이브. 일반 위키 페이지의 최소 요구사항 중
MVP에서 제외됐던 **편집 완성도**와 **협업 기능**을 채운다. 프론트 전용 —
백엔드는 후속이며 localStorage 스토어(`wikiStore.ts`)가 교체 지점이라는 원칙을 유지한다.

### 포함 (W4)

1. **페이지 이동 + 트리 드래그 정렬** — @dnd-kit, 사이드바 트리에서 순서 변경·부모 변경
2. **[[제목]] 페이지 간 링크 + 편집기 자동완성**
3. **코멘트 수정/삭제/답글** (중첩 1단)
4. **버전 diff 비교** (직전 버전과 라인 단위 비교)

### 제외 (후속 웨이브)

- 이미지/첨부 업로드 — 백엔드(파일 서비스) 생긴 뒤 제대로 구현
- 즐겨찾기·최근 본 페이지, 감시/알림, 라벨, 전문 검색, 스페이스 홈/설정
- WYSIWYG 에디터, 실시간 동시 편집, 권한/공유

### 접근 원칙 (A안 — 최소 의존성)

신규 의존성은 `@dnd-kit/core` + `@dnd-kit/sortable`뿐. diff·링크 변환·자동완성은
자체 구현(순수 함수 + 디자인 시스템 컴포넌트). "UI는 100% 디자인 시스템" 철학 유지.

## 2. 도메인 모델 변경

```ts
interface Comment {
  id: string;
  pageId: string;
  authorId: string;
  body: string;
  parentId: string | null;   // 신규 — null = 최상위, 값 있으면 답글 (중첩 1단 제한)
  createdAt: string;
  updatedAt: string | null;  // 신규 — 수정된 적 없으면 null, "(수정됨)" 표시 근거
}
```

- `Page`, `PageVersion`, `Space`, `User`는 변경 없음. 페이지 이동은 기존 `parentId`/`position` 갱신.
- **기존 데이터 호환**: `wiki.v1` 키 유지. load 시 코멘트에 누락된 `parentId`/`updatedAt`을
  `null`로 정규화한다 (별도 스토리지 마이그레이션 없음).

## 3. 스토어 API 변경 (`wikiStore.ts`)

```ts
movePage(id: string, target: {
  parentId: string | null;     // 새 부모 (null = 루트)
  beforeId?: string | null;    // 이 형제 앞에 삽입, 생략/null이면 맨 뒤
}): Promise<Page>
```

- 규칙: ① 페이지·대상 부모 존재 검증, 부모는 같은 스페이스 ② **순환 금지** — 자기 자신
  또는 자기 자손을 부모로 지정하면 `"페이지를 자신의 하위로 이동할 수 없습니다"` throw
  ③ `beforeId`는 대상 부모의 자식이어야 함 ④ 이동 후 대상 형제 집합의 position을 1..n으로
  전체 재부여 (기존 max+1 생성 규칙과 공존 — 재부여는 이동 시에만)
- 이동은 내용 변경이 아니므로 **버전 스냅샷을 만들지 않고** `updatedBy`/`updatedAt`도 갱신하지 않는다.

```ts
addComment(pageId: string, body: string, parentId?: string | null): Promise<Comment>
// parentId 지정 시: 부모 코멘트 존재 + 같은 페이지 검증,
// 부모가 이미 답글이면 "답글에는 답글을 달 수 없습니다" throw

updateComment(id: string, body: string): Promise<Comment>
// 작성자 본인(CURRENT_USER_ID) 아니면 "본인의 코멘트만 수정할 수 있습니다" throw
// 빈 본문 throw, 실변경 시 updatedAt 갱신 (무변경이면 no-op)

deleteComment(id: string): Promise<void>
// 작성자 본인 아니면 "본인의 코멘트만 삭제할 수 있습니다" throw
// 최상위 코멘트 삭제 시 그 답글도 연쇄 삭제
```

- `deletePage`의 코멘트 연쇄 삭제는 답글 포함 그대로 동작 (pageId 필터라 자동 커버).

### diff 유틸 (스토어 아님 — 순수 함수)

`src/features/wiki/lib/lineDiff.ts`:

```ts
type DiffLine = { kind: "same" | "added" | "removed"; text: string };
function lineDiff(oldText: string, newText: string): DiffLine[]
```

- LCS(최장 공통 부분열) 기반 라인 단위 diff. 라이브러리 없이 구현, 단위 테스트 필수.
- 표시 순서: removed가 added보다 먼저 (통상 diff 관례).

## 4. 화면 설계

### 4.1 트리 드래그 정렬 (`PageTree`)

- dnd-kit 공식 tree 패턴: 보이는(접힘 반영) 트리를 평탄화한 배열로 `SortableContext` 구성,
  드래그 중 포인터 수평 오프셋으로 목표 깊이를 투영해 들여쓰기 미리보기(인디케이터) 표시.
- 드롭 시 투영된 (parentId, beforeId)로 `movePage` 호출 후 트리 리로드.
- 드래그 시작 시 해당 노드의 자손을 임시로 접어 자기 자손 밑 드롭을 UI에서 차단(스토어도 방어).
- 실패(순환 등) 시 Toast(danger). 검색 필터가 활성일 때는 드래그 비활성(부분 트리에서의
  position 계산 모호성 제거).
- 키보드 대안: 이번 웨이브는 포인터 드래그만. (메뉴 기반 이동은 채택하지 않음 — 사용자 결정)

### 4.2 [[제목]] 페이지 링크

- **렌더 (`MarkdownView`)**: 렌더 전 전처리로 본문의 `[[제목]]`을 마크다운 링크로 치환.
  - 매칭: 같은 스페이스 내 제목 **정확 일치(대소문자 무시, trim)**. 중복 제목이면 첫 페이지.
  - 존재: 해당 페이지 보기 경로로 react-router 링크(내부 네비게이션, 전체 리로드 없음).
  - 부재: 빨간 링크(danger 색) → 클릭 시 `pages/new?title=<제목>`으로 이동해 그 제목이
    미리 채워진 생성 화면. (PageEditPage가 `title` 쿼리 파라미터를 읽도록 확장)
  - 코드 블록/인라인 코드 안의 `[[...]]`는 치환하지 않는다.
- **자동완성 (`PageEditPage` 본문 TextArea)**: `[[` 입력 감지 → 커서 좌표 아래 드롭다운으로
  같은 스페이스 페이지 제목 목록(입력 중 텍스트로 필터, 최대 8개). ↑↓ 이동, Enter/클릭 선택 시
  `[[제목]]` 완성(닫는 `]]` 자동), Esc/포커스 이탈로 닫기. 토큰 CSS로 자체 구현.

### 4.3 코멘트 (`CommentSection`)

- 목록: 최상위 코멘트 시간순, 각 코멘트 아래 답글 1단 들여쓰기 시간순.
- 각 코멘트: Avatar+이름+시각(+"(수정됨)"), 본문, "답글" 버튼(최상위에만).
- 본인 코멘트: "수정"(인라인 TextArea 전환 + 저장/취소) / "삭제"(확인 후 진행,
  답글이 있으면 "답글 N개도 함께 삭제됩니다" 경고 포함).
- 답글 작성: "답글" 클릭 시 해당 코멘트 아래 인라인 작성 폼.

### 4.4 버전 diff (`HistoryModal`)

- 버전 선택 시 미리보기 영역에 Tabs 추가: **내용**(기존 MarkdownView 미리보기) /
  **변경사항**(선택 버전 vs 직전 버전 lineDiff 결과).
- diff 표시: `+` 라인은 성공색 배경, `-` 라인은 위험색 배경, 무변경 라인은 기본. 제목이
  바뀐 경우 상단에 "제목: 이전 → 현재" 한 줄 표시.
- v1 선택 시 전체가 추가(added)로 표시.

## 5. 테스트 전략

- **스토어 (필수)**: movePage — 순환 거부(자신/자손), 다른 스페이스 부모 거부, beforeId
  삽입 위치·position 1..n 재부여, 버전 스냅샷 없음 / 코멘트 — 답글 1단 제한, 타인 코멘트
  수정·삭제 거부, 최상위 삭제 시 답글 연쇄, updateComment no-op / 구버전 데이터
  (parentId 없는 코멘트) load 정규화
- **lineDiff (필수)**: 동일 텍스트, 추가만, 삭제만, 혼합, 빈 문자열 양방향
- **화면 (핵심 흐름)**: [[링크]] 존재/부재 렌더와 네비게이션, 자동완성 선택 흐름,
  코멘트 수정·답글·삭제 흐름, 히스토리 변경사항 탭 표시. 트리 DnD는 jsdom 한계로
  스토어 테스트 중심 + 트리 렌더 스모크만.
- 게이트: `tsc --noEmit` + `vitest run` + `vite build`

## 6. 구현 순서

1. **W4-1**: 스토어 확장(movePage, 코멘트 3종, load 정규화) + lineDiff 유틸 (+테스트)
2. **W4-2**: 코멘트 UI(수정/삭제/답글) + HistoryModal diff 탭
3. **W4-3**: [[링크]] 렌더 + 생성 화면 title 프리필 + 편집기 자동완성
4. **W4-4**: @dnd-kit 도입 + PageTree 드래그 정렬/이동

각 단계는 독립적으로 게이트 통과 가능하게 순서를 잡았다 (난이도 높은 DnD를 마지막에).
