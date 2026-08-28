# store/ — 데이터 스토어 규약

`wikiStore.ts`는 **백엔드 교체 지점**이다. 화면은 이 파일의 async 함수만 호출하므로,
wiki-service가 붙으면 함수 내부만 `apiFetch`로 교체한다 — **함수 시그니처와 아래 의미론을
바꾸면 화면 전체에 파급된다.** REST 매핑 제안: `docs/backend/2026-07-17-wiki-service-requirements.md`.

## 지켜야 할 의미론 (테스트가 고정하고 있음)

- **반환값은 항상 깊은 복사본**(`clone` = structuredClone) — 내부 상태 유출 금지.
- **무변경 no-op**: `updatePage`/`updateComment`는 내용이 같으면 버전·updatedAt을 건드리지 않고 반환.
- **버전 스냅샷은 부수효과**: `createPage`(v1)·`updatePage`(max+1)·`restoreVersion`(updatePage 경유 →
  복원도 새 버전으로 쌓여 히스토리가 끊기지 않음). `movePage`는 내용 변경이 아니므로
  스냅샷 없음 + updatedBy/updatedAt 불변.
- **movePage 순환 금지**: 새 부모의 조상 체인에 자신이 있으면 거부. visited 셋으로 손상 데이터의
  parentId 순환에도 무한 루프하지 않는다.
- **position**: 형제(같은 스페이스·같은 부모) 내 1..n 연속 재부여.
- **deletePage(id, options?)**: 자식이 있는데 `options.children`이 없으면 **거부**(기존 계약).
  화면이 사용자에게 물어 고른 값을 넘긴다 — `"promote"`(자식을 대상의 부모로 올리고 대상만 삭제,
  자식이 대상의 position 자리를 이어받음) 또는 `"cascade"`(후손 전부 삭제). 어느 쪽이든
  지워지는 페이지의 버전·코멘트는 연쇄 삭제. cascade는 visited 셋으로 순환 데이터에서도 안전.
  백엔드 모드도 같은 의미론이다 — 서버가 `?children=promote|cascade`를 받아 한 트랜잭션에서
  처리하고, 옵션 없이 자식이 있으면 409를 준다(wiki-backend V2).
- **코멘트**: 답글 중첩 1단만(답글의 답글 거부), 본인만 수정/삭제, 최상위 삭제 시 답글 연쇄 삭제.
- **휴지통(W21-1)**: `deletePage`는 **소프트 삭제**다 — 페이지·버전·댓글이 사라지지 않고 휴지통으로
  간다. `listTrash(spaceId)`는 사용자가 직접 버린 항목만 행으로 주고 함께 딸려간 하위는
  `descendantCount`로 센다. `restorePage(id)`는 루트 + "따로 버리지 않은" 하위를 한 묶음으로
  되살리고, 원래 부모가 사라졌으면 최상위로 올리며 `reparentedToRoot: true`를 준다.
  `purgePage`/`emptyTrash`는 되돌릴 수 없다(백엔드는 스페이스 ADMIN만 허용).
- **라벨(W21-2)**: 이름은 정규화한다 — trim + 소문자 + 내부 공백은 하이픈. `setLabels`는 **전량
  교체**(부분 추가/삭제 API를 두지 않는다). 정렬은 코드유닛 기준(백엔드 SQL `order by name`과 일치) —
  `localeCompare`를 쓰면 목업/백엔드 모드의 칩 순서가 갈린다.
- **백링크(W21-2)**: 본문 `[[제목]]`의 역방향. 대상은 id가 아니라 **제목**이다(렌더러
  `resolveWikiLinks`와 같은 기준) — 코드 구간(``` / `)의 대괄호는 링크로 세지 않는다.
- **인라인 댓글(W21-4)**: `addComment(pageId, body, parentId, anchor)`의 anchor는 **렌더된 본문**의
  `{quote, occurrence}`다. 마크다운 원문 오프셋이 아니다 — 서식을 가로지르는 선택을 표현할 수
  없기 때문. 못 찾은 스레드는 지우지 않고 화면이 "위치 없음"으로 표시한다. `setCommentResolved`는
  인라인 스레드에만 쓴다.
- **구독(W21-4)**: 알림 대상은 `watches`가 단일 원장이다. 만들거나 고치거나 댓글을 달면 자동
  구독되고 `setWatchState(pageId, false)`로 끌 수 있다. 구독 개념 이전 데이터는 `normalize`가
  작성자·편집자를 구독자로 백필한다(백엔드 V15 백필과 같은 규칙).
- **에러는 한국어 사용자 문구로 throw** — 화면이 메시지를 그대로 노출한다.
- **편집 세션 낙관적 락**: 화면은 로드 때 받은 `Page.version`을 `updatePage(...,
  { expectedVersion })`에 넘긴다. API 어댑터가 저장 직전 조회한 최신 버전으로 바꾸면 stale 편집이
  다른 사용자의 변경을 덮어쓰므로 금지한다. `PageConflictError`는 최신 서버본을 함께 보존한다.

## 목업 한정 사항 (백엔드 전환 시 제거 대상)

- `CURRENT_USER_ID`(mock/users.ts u1) 하드코딩 — 서버는 토큰 주체로 `createdBy` 등을 채운다.
- localStorage `wiki.v1` + 메모리 캐시, 손상 시 시드 재생성(`isWikiData` 검증 + `normalize` 구버전 보정).
- `__resetForTest()`는 테스트 전용(메모리 캐시만 초기화, localStorage 불변).

## 타입

`types.ts`가 도메인 모델의 원천 — 백엔드 계약 문서의 엔티티 표와 1:1을 유지한다.
