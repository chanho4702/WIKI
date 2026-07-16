# wiki-service 백엔드 요구사항

- 작성일: 2026-07-17 (W4 완료 시점 기준)
- 목적: 프론트(wiki-front)의 localStorage 목업 스토어(`src/features/wiki/store/wikiStore.ts`)를
  실제 백엔드로 교체하기 위한 요구사항 정리. **프론트 화면은 wikiStore의 async 함수만 호출**하므로,
  백엔드가 이 문서의 계약을 지키면 wikiStore.ts 내부만 fetch로 바꿔 끼우면 된다.

## 1. 아키텍처 전제

- MSA의 한 서비스(wiki-service)로 게이트웨이(nginx) 뒤에 배치. ALM(지라 클론) 서비스와 동일 패턴.
- 인증은 기존 **oauth-oidc-login 백엔드(Keycloak OIDC)** 를 그대로 사용 — wiki-service는 리소스 서버.
- 프론트는 `/wiki` base로 서빙되며 이미 AuthGate(로그인 게이트)가 붙어 있다.

## 2. 인증/인가 (기존 계약 준수)

프론트 `src/auth/`가 이미 구현한 계약 — wiki-service는 여기 맞춘다:

- 요청마다 `Authorization: Bearer <AT>` 헤더. **401 응답 시 프론트가 `/api/auth/refresh`(HttpOnly RT 쿠키)로
  AT 재발급 후 1회 재시도** — 따라서 만료 AT에는 반드시 401을 반환(403 아님).
- 사용자 신원은 **토큰에서 서버가 추출**한다. 프론트의 `CURRENT_USER_ID`(목업 u1) 하드코딩은 제거 대상 —
  `createdBy`/`updatedBy`/`authorId`/`savedBy`는 전부 **서버가 토큰 주체로 채운다**(요청 바디로 받지 않음).
- 사용자 식별자: Keycloak `sub`(또는 내부 매핑 id). `GET /api/me`의 `AppUser { email, name?, provider?, sub?, role? }`와 일관되게.
- 위키 사용자 목록(작성자 이름/아바타 표시용): `listUsers()` 대체 — 스페이스 멤버 또는 전체 사용자 조회 API 필요.
  최소 `{ id, name }`. (프론트는 id→이름 매핑에만 사용)

## 3. 도메인 모델

프론트 `types.ts`와 1:1 (서버 스키마의 최소 필드셋):

| 엔티티 | 필드 | 비고 |
|---|---|---|
| Space | id, key, name, createdAt | key: 대문자 접두어, **유니크** |
| Page | id, spaceId, parentId(null=루트), title, body(마크다운 원문), position, createdBy, updatedBy, createdAt, updatedAt | parentId 인접 리스트, 깊이 제한 없음 |
| PageVersion | id, pageId, version(1부터), title, body, savedBy, savedAt | 페이지당 version 연속 증가 |
| Comment | id, pageId, authorId, body, parentId(null=최상위), createdAt, updatedAt(null=미수정) | **답글 중첩 1단** |

- 시각은 ISO-8601(UTC) 문자열로 반환 (프론트가 `toLocaleString("ko-KR")` 변환).

## 4. API 계약 (wikiStore 함수 → REST 매핑 제안)

| wikiStore 함수 | 메서드/경로 제안 | 비고 |
|---|---|---|
| listUsers() | GET /api/wiki/users | `{id, name}[]` |
| getCurrentUser() | (auth 백엔드) GET /api/me | 프론트에서 id 매핑 |
| listSpaces() | GET /api/wiki/spaces | |
| createSpace({key, name}) | POST /api/wiki/spaces | 키 대문자 정규화+중복 409 |
| listPages(spaceId) | GET /api/wiki/spaces/{spaceId}/pages | 전체 목록(트리 구성은 프론트) |
| getPage(id) | GET /api/wiki/pages/{id} | 없으면 404 |
| createPage({spaceId, parentId?, title, body?}) | POST /api/wiki/pages | **v1 스냅샷 자동 생성** |
| updatePage(id, {title?, body?}) | PATCH /api/wiki/pages/{id} | 실변경 시만 새 버전 스냅샷, 무변경 no-op |
| deletePage(id) | DELETE /api/wiki/pages/{id} | 하위 존재 시 409, 버전·코멘트 연쇄 삭제 |
| movePage(id, {parentId, beforeId?}) | PUT /api/wiki/pages/{id}/position | 아래 이동 규칙 참조 |
| listVersions(pageId) | GET /api/wiki/pages/{pageId}/versions | version 내림차순 |
| restoreVersion(pageId, versionId) | POST /api/wiki/pages/{pageId}/restore | updatePage 경로 재사용(새 버전으로 쌓임) |
| listComments(pageId) | GET /api/wiki/pages/{pageId}/comments | createdAt 오름차순 |
| addComment(pageId, body, parentId?) | POST /api/wiki/pages/{pageId}/comments | |
| updateComment(id, body) | PATCH /api/wiki/comments/{id} | **본인만** |
| deleteComment(id) | DELETE /api/wiki/comments/{id} | **본인만**, 답글 연쇄 삭제 |

## 5. 도메인 규칙 — 서버가 강제해야 하는 불변식

프론트 검증은 UX 보조일 뿐이다. 아래는 전부 서버에서 재검증:

**스페이스**
- key는 trim+대문자 정규화 후 저장, 중복 거부.

**페이지**
- 제목 trim 후 비어 있으면 거부. 부모는 같은 스페이스의 페이지여야 함.
- position은 형제(같은 spaceId+parentId) 내 정렬값. 생성 시 max+1.
- 삭제: 하위 페이지 존재 시 거부. 성공 시 그 페이지의 버전·코멘트 연쇄 삭제.

**버전(스냅샷은 저장의 부수효과 — 프론트는 스냅샷 로직을 모른다)**
- createPage → v1 스냅샷. updatePage → **title/body 실변경 시에만** 적용 후 내용을 version=max+1로 스냅샷,
  무변경이면 no-op(버전·updatedBy/updatedAt 불변). restoreVersion → updatePage 경로 재사용(히스토리 연속).

**이동(movePage)**
- 자기 자신/자기 자손을 부모로 지정하면 거부(순환 금지).
- beforeId는 대상 부모의 자식이어야 함(그 앞에 삽입, 없으면 맨 뒤).
- 대상 형제 집합 position 1..n 재부여. **버전 스냅샷 없음, updatedBy/updatedAt 불변.**
- 트랜잭션으로 처리(형제 재정렬 중 부분 실패 금지).

**코멘트**
- 답글 중첩 1단: parentId가 가리키는 코멘트가 이미 답글이면 거부. 부모는 같은 페이지의 코멘트.
- 수정/삭제는 **작성자 본인만**(토큰 주체와 authorId 비교 — 관리자 role 예외는 정책 결정 필요).
- 수정: 빈 본문 거부, 실변경 시만 updatedAt 갱신(무변경 no-op). 삭제: 최상위 삭제 시 답글 연쇄 삭제.

## 6. 에러 계약

프론트는 에러 응답의 `message`를 Toast(danger)로 **그대로 표시**한다. 응답 형식: `{ "message": string }` (+ 상태코드).
현재 프론트/스토어가 쓰는 한국어 메시지를 유지하면 화면 수정이 필요 없다:

| 상황 | HTTP | message |
|---|---|---|
| 스페이스 키 중복 | 409 | `이미 존재하는 스페이스 키입니다: {KEY}` |
| 스페이스 키/이름 누락 | 400 | `스페이스 키를 입력하세요` / `스페이스 이름을 입력하세요` |
| 페이지 없음 | 404 | `페이지를 찾을 수 없습니다` |
| 제목 누락 | 400 | `페이지 제목을 입력하세요` |
| 부모 없음/타 스페이스 | 400 | `부모 페이지를 찾을 수 없습니다` / `부모 페이지가 같은 스페이스에 없습니다` |
| 하위 존재 삭제 | 409 | `하위 페이지가 있어 삭제할 수 없습니다` |
| 순환 이동 | 400 | `페이지를 자신의 하위로 이동할 수 없습니다` |
| beforeId 불일치 | 400 | `기준 페이지가 대상 위치에 없습니다` |
| 버전 없음 | 404 | `버전을 찾을 수 없습니다` |
| 코멘트 본문 누락 | 400 | `코멘트 내용을 입력하세요` |
| 부모 코멘트 없음/타 페이지/답글에 답글 | 400 | `부모 코멘트를 찾을 수 없습니다` / `부모 코멘트가 같은 페이지에 없습니다` / `답글에는 답글을 달 수 없습니다` |
| 타인 코멘트 수정/삭제 | 403 | `본인의 코멘트만 수정할 수 있습니다` / `본인의 코멘트만 삭제할 수 있습니다` |

## 7. 정책 결정 필요 (W4 리뷰에서 도출)

1. **타인 답글이 달린 코멘트 삭제**: 현재 프론트/목업은 연쇄 삭제(경고 후). 컨플루언스는 답글이 있으면
   삭제를 차단한다. 백엔드 권장: 타인 답글 존재 시 409로 거부하거나 소프트 삭제("삭제된 코멘트" 표시) —
   결정되면 프론트 confirm 문구/동작 갱신.
2. **동시 편집 충돌**: 목업은 마지막 저장 승리. 백엔드에서는 updatePage에 기준 버전(`baseVersion`)을 받아
   불일치 시 409(낙관적 잠금)를 권장 — 프론트는 충돌 안내 UI 후속.
3. **권한 모델**: 현재는 로그인만 하면 전부 가능. 스페이스 단위 read/write/admin 권한 도입 여부.
4. **코멘트 삭제의 관리자 예외**, 페이지 삭제 권한(작성자만? 전원?) 등 역할 정책.

## 8. 다음 웨이브 기능의 백엔드 요구 (W4에서 의도적으로 미룸)

- **이미지/첨부**: 파일 업로드 서비스(멀티파트), 페이지-첨부 연결, 본문에서 첨부 참조 규약,
  삭제 시 고아 파일 정리. (W4에서 프론트 구현을 보류한 유일한 이유가 백엔드 부재)
- **전문 검색**: 제목+본문 검색 엔드포인트 (`GET /api/wiki/search?spaceId=&q=`). 현재 사이드바 검색은
  제목 필터(클라이언트)뿐.
- **알림/감시**: 페이지 watch 토글 + 변경 이벤트. 활동 피드(최근 업데이트).
- **즐겨찾기/최근 본 페이지**: 사용자별 상태 저장.

## 9. 비기능 요구

- **응답 크기**: listPages는 스페이스 전체를 반환(트리는 프론트 구성) — 페이지 수가 커지면 body 제외한
  목록 DTO(제목/트리 필드만) + getPage에서 body 반환으로 분리 권장. 버전/코멘트는 페이지네이션 고려.
- **CORS/쿠키**: 게이트웨이 뒤 동일 오리진이면 불필요. 분리 배포 시 `credentials: 'include'` 허용 필요
  (refresh 쿠키 때문 — auth 백엔드와 동일 정책).
- **데이터 이관**: 필요 시 localStorage `wiki.v1` JSON을 그대로 받는 1회성 임포트 엔드포인트(선택).
- **프론트 교체 작업 범위**: `wikiStore.ts` 내부를 `authClient.apiFetch` 기반으로 교체 + `mock/` 제거 +
  `CURRENT_USER_ID` 의존(스토어 내부) 제거. 화면 코드는 무수정이 목표. 스토어 계약 테스트
  (`wikiStore.*.test.ts`)는 msw 등으로 이식하거나 계약 테스트로 전환.

## 10. 제안 진행 순서

1. 스키마+CRUD(스페이스/페이지/버전/코멘트) — 6장 에러 계약 포함
2. 인증 연동(리소스 서버 설정, 토큰 주체→작성자 매핑, 사용자 목록 API)
3. movePage 트랜잭션 + 코멘트 권한 검증
4. 프론트 wikiStore fetch 교체 (계약 테스트로 검증)
5. 7장 정책 확정 반영 → 8장 기능(첨부→검색→알림 순) 웨이브별 진행
