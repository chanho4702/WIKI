# 프론트 ↔ wiki-backend 연결 — 설계 문서

작성 2026-07-21. 결정: **백엔드 연결 먼저**(홈 대시보드는 그 후). 근거: wikiStore가 아직 localStorage 목업이라, 목업 위에 새 기능을 얹으면 재작업이 된다.

관련: `src/features/wiki/store/CLAUDE.md`(스토어 계약 — 시그니처·의미론 고정), `docs/backend/2026-07-17-wiki-service-requirements.md`(초기 REST 제안 — **실제 백엔드와 상이**, 아래 §2 대조).

## 1. 현실 (탐색 결과)

- **wiki-backend** (Spring Boot 4 / Java 24 / Postgres / Flyway, `/api/wiki/*`, 서비스 :9110 ← 게이트웨이 :8000, **모든 요청 JWT 필수**) 가 제공: **스페이스 CRUD · 페이지 CRUD+트리+이동(PUT로 parentId)+낙관적락(`expectedVersion`→409) · 버전/복원 · 첨부파일.** 그 외 전부 없음.
- **프론트**: `wikiStore.ts`는 localStorage 목업. 인증은 `src/auth/client.ts`의 `apiFetch`(JWT bearer + 401 refresh, `credentials: include`)가 이미 존재하나 **AuthGate가 `import.meta.env.PROD` 전용** → dev/test는 인증 OFF.

## 2. 백엔드↔프론트 계약 대조 & 매핑

| 개념 | 백엔드 | 프론트(현재) | 경계 매핑(어댑터) |
|---|---|---|---|
| id | `Long` | `string`(UUID) | 경계에서 `String(id)` ↔ `Number(id)`. 프론트 타입 **string 유지**. |
| Space | `{id,key,name,description,createdBy,createdAt,updatedAt}` | `{id,key,name,createdAt}` | `description` 추가(선택). owner/labels/icon 없음. |
| Page 본문 | `content` | `body` | 필드명 매핑. |
| Page 버전 | `version:int`(수동 락 카운터) | 없음 | `Page.version` 추가 노출 → 낙관적 락. |
| Page 순서 | **없음**(트리 `{id,parentId,title}`, position 없음) | `position` | §4-3 참조(서버 미영속). |
| 수정 | `PUT` + `expectedVersion` → 409 | `updatePage(id,patch)` | 시그니처에 version 반영(§4-4). 409 → "다른 사용자가 먼저 수정했습니다". |
| 이동 | `PUT`로 parentId 변경(별도 move 없음) | `movePage(id,{parentId,beforeId})` | parentId만 서버 반영, beforeId(순서)는 §4-3. |
| 버전 | RevisionMeta/Response(`editedBy`,`createdAt`) | PageVersion(`savedBy`,`savedAt`) | 필드 매핑. |
| 시간 | `Instant`(ISO) | `string`(ISO) | 그대로. |
| 에러 | `{ "error": "msg" }` 404/403/409/400 | 한국어 throw | 응답 `error`를 한국어 문구로 throw(폴백 상태코드별 메시지). |

## 3. 설계 원칙

1. **wikiStore 시그니처·의미론 불변**(store/CLAUDE.md) — 화면·테스트 무수정이 목표. 내부만 `apiFetch`로 교체. (낙관적 락 때문에 `updatePage`만 version 추가가 불가피 — §4-4에서 최소 침습안.)
2. **듀얼 모드** — `import.meta.env.VITE_API_BASE`(게이트웨이 URL) 설정 시 **백엔드 어댑터**, 미설정 시 **localStorage 목업**. 테스트/CI·오프라인 dev는 목업 유지 → **기존 420 테스트 green** + 마이그레이션 리스크 격리. 스토어 진입점이 모드에 따라 mock/backend 구현을 고른다.
3. **apiFetch 공유** — AuthGate의 auth client를 싱글톤으로 노출(또는 wikiStore에 주입)해 JWT/refresh 로직을 재사용. baseUrl = `VITE_API_BASE`.

## 4. 불가피한 갭 & 처리

1. **사용자 이름/아바타** — 백엔드에 User 없음(JWT `sub`=Long, 이름은 org-service gRPC). → 폴백 `사용자 #{id}` + id 기반 이니셜/`Avatar color="auto"`. 현재 사용자만 `/api/me`(auth)로 이름 확보. **org-service users API 노출은 후속.** 영향: 페이지 메타·히스토리·(피드)·댓글 작성자.
2. **댓글** — 백엔드 없음 → **localStorage 목업 유지**(페이지의 백엔드 id로 키). 별도 모듈로 분리해 백엔드 데이터와 공존. 백엔드 comments는 후속.
3. **페이지 형제 순서(position)** — 백엔드 트리에 순서/position 없음, move는 parent만 반영 → **드래그 순서변경은 서버에 안 남는다**(부모 이동만 영속). 프론트는 트리 order를 title/생성순 or 로컬 보조. → §7 결정(수용 vs 백엔드에 position 추가 요청).
4. **낙관적 락** — `updatePage`가 최신 `version`을 알아야 함. 최소 침습안: 스토어가 `getPage` 결과의 version을 내부 캐시/전달해 PUT 시 `expectedVersion`로 보냄. 화면(PageEditPage)은 무변경 목표(스토어가 version 관리). 409 시 사용자에게 충돌 안내.

## 5. 인프라 전제 (dev에서 백엔드 모드로 띄우려면)

- 구동 필요: 게이트웨이 :8000 · 인증서버(JWKS :9000) · **org-service(gRPC 권한 :9131, 미가동 시 403 fail-closed)** · postgres :5433 · wiki-backend :9110 · eureka.
- **dev 인증**: AuthGate가 프로덕션 전용이라 백엔드 모드에선 토큰 확보 방법 필요 → §7 결정 (a) dev에서 AuthGate `enabled` on, (b) `VITE_DEV_TOKEN`.
- **DB 시드 없음** → 최초 빈 목록. 권한 grant 없으면 목록 빈 배열.

## 6. 단계 계획 (제안)

1. **설정·배선** — auth client 싱글톤 공유 + `VITE_API_BASE` 듀얼모드 스위치 + 공통 `wikiApi`(경계 매핑·에러 변환).
2. **spaces** 어댑터(list/create/get/update/delete) + 매핑 + fetch-모킹 계약 테스트.
3. **pages** 어댑터(create/get/tree/update(+락)/delete/move via PUT).
4. **versions** 어댑터(revisions/restore).
5. **users 폴백 리졸버**(`사용자 #{id}` + /api/me).
6. **attachments**(신규 capability; 에디터 첨부 배선은 후속 별도).
7. **comments** 목업 유지 분리.
8. **dev 인증/토큰 구성** 문서화 + 스모크(빈 DB에 스페이스 1개 생성→트리→편집→버전 왕복).

각 단계는 목업 모드 테스트 green 유지 + 백엔드 모드 수동 스모크.

## 7. 결정 (확정, 2026-07-21)

1. **듀얼모드 채택** — 목업 기본 + `VITE_API_BASE` 설정 시 백엔드. 테스트/오프라인 보존.
2. **dev 인증** — 백엔드 모드(`VITE_API_BASE` 설정)일 때만 **dev에서도 AuthGate `enabled`** → keycloak 실제 로그인으로 실 토큰 확보. 권한이 org-service fail-closed(403)라 실 grant가 필요하므로 가짜 dev 토큰은 부적합. 순수 목업 dev는 인증 OFF 유지.
3. **사용자 이름 폴백 `사용자 #{id}`** 채택. org-service users API 노출은 후속.
4. **페이지 형제 순서(position) 서버 미영속 수용** — 부모 이동만 영속. wiki-backend `position` 추가는 **후속 티켓**.
5. **댓글 localStorage 목업 유지** 채택. 백엔드 comments는 후속.
6. **플랫폼 로컬 구동 가능** 확인됨 → dev 백엔드 모드에서 실제 로그인 스모크 테스트 수행 가능.

## 8. 테스트

- **목업 모드 유지** → 기존 420 green(회귀 게이트).
- **어댑터 계약 테스트**(fetch 모킹): id Long↔string, content↔body, `expectedVersion` 전송, 409→충돌 에러, 에러 `{error}`→한국어.
- 콜로케이션 유닛(경계 매핑 순수 함수).
