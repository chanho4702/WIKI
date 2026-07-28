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
- **에러는 한국어 사용자 문구로 throw** — 화면이 메시지를 그대로 노출한다.

## 목업 한정 사항 (백엔드 전환 시 제거 대상)

- `CURRENT_USER_ID`(mock/users.ts u1) 하드코딩 — 서버는 토큰 주체로 `createdBy` 등을 채운다.
- localStorage `wiki.v1` + 메모리 캐시, 손상 시 시드 재생성(`isWikiData` 검증 + `normalize` 구버전 보정).
- `__resetForTest()`는 테스트 전용(메모리 캐시만 초기화, localStorage 불변).

## 타입

`types.ts`가 도메인 모델의 원천 — 백엔드 계약 문서의 엔티티 표와 1:1을 유지한다.
