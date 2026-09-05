# 이관 엔진 분리 — migration-service + 위키 import API (2026-09-05, A안)

사용자 결정: "노션·컨플 마이그레이션은 **따로 모듈로 제공**해서 만들 거임, 위키에 있으면 안 됨" → A(별도 서비스 + 위키 import API), 사용자 작업 뒤 착수.
현재 M1~M3 엔진(`wiki-backend/migration/**`, 설계 `2026-09-05-confluence-dc-migration-design.md`)을 새 서비스로 옮기고, 위키에는 "이관 데이터를 원본
그대로 받아 넣는" 내부 API만 남긴다.

## 0. 실측 — 엔진이 위키 내부에 기대는 것 (공개 REST로는 안 되는 것)

| 필요 | 지금 쓰는 내부 경로 |
|---|---|
| 원본 생성/수정 시각 보존, 버전 k+1부터 시작 | `Page.imported(...)`, `PageRepository.overwriteTimestamps` |
| 미매핑 작성자 표시 | `page.markImportedAuthor(name, sourceUrl)` |
| 재이관: 제목·본문 갱신 + updatedAt 원본으로 | `page.reimport(...)` |
| 버전 올리지 않는 본문 재작성(첨부 URL fixup) | `page.rewriteImportedContent` + 현재 리비전 본문 교체 |
| 형제 순서 | `page.resequence`, `findMaxSortOrder` |
| 지난 버전 리비전(편집자 이름·저장 시각·요약) | `PageRevision.imported`, `overwriteCreatedAt` |
| 라벨을 권한 검사·이중 색인 없이 | `labels.deleteByPageId` + 직접 저장, `tasks.sync`, `reindexLinks` |
| 검색 색인 이벤트는 쏘되 알림·자동 구독은 안 쏨 | `events.afterCommit(pageCreated/pageUpdated)` |
| 첨부: 페이지 생기기 전 스테이징, 재업로드 없이 등록 | `AttachmentService.stageImported/registerStored`, manifest에 저장소 좌표 |
| 댓글: 작성자 이름 스냅샷·원본 시각·알림 없음 | `CommentService.createImported` |
| 제한: 권한 검사·감사·자기 잠금 방지 없이 | `PageRestrictionService.replaceImported` |
| 링크 fixup: 새 리비전 "이관 링크 정리" | `MigrationLinkFixupWriter`(page.edit) |
| 주체 매핑 | org gRPC LookupMembers/LookupTeams(엔진이 그대로 가져감) |

## 1. 목표 구조

```
migration-service (새 리포·새 DB migrationdb·:9170 — 9140은 search-service)        wiki-backend
 ├ job/item/issue/object_map/source/payload (자기 Flyway)   ├ /internal/wiki/import/**  ← X-Internal-Token
 ├ DC 클라이언트·discover·정규화기·IR 스키마·검증기·writer     │   페이지/리비전/첨부/댓글/제한/라벨/본문 재작성/검증 조회
 ├ 핸들러 5종 → WikiImportClient(HTTP)                       ├ page.imported_author_name/url (남김)
 ├ org gRPC(주체 매핑)                                       └ migration_* 테이블 제거(V37)
 └ REST /api/migration/** (게이트웨이 라우트, 관리 화면이 부름)
```
- 첨부 바이트는 엔진이 DC에서 받아 **위키 import API로 업로드**한다(위키 저장소를 직접 만지지 않는다 — 좌표 결합이 끊긴다). 스테이징은 엔진 DB/임시 저장소.
- 객체 매핑(원본→위키 id)은 엔진이 가진다. 위키 import API는 멱등 키를 강제하지 않고 명시적 create/update로 받는다 — 위키는 "이관 원장"을 모른다.
- 관리 화면 `/admin/migrations`(wiki-front)는 그대로 두되 base path를 `/api/migration`으로. 전역 관리자 판정은 org `/me`(이미 그렇게 됨).

## 2. 위키 import API (`/internal/wiki/import`, 게이트웨이·nginx 미노출, `X-Internal-Token`=`WIKI_INTERNAL_TOKEN`, `X-Actor-Id`=잡 요청자)
| 메서드 | 경로 | 본문 → 응답 |
|---|---|---|
| POST | `/pages` | `{spaceId, parentId?, type: PAGE\|BLOG, title, content, createdAt, updatedAt, authorId?, importedAuthorName?, sourceUrl?, sortOrder?, labels[], revisions?: [{version, title, content, editorId?, editorName, savedAt, changeNote?}]}` → `{pageId, version}`. 리비전이 오면 1..k를 깔고 현재본을 k+1로. 검색 색인 이벤트만 발행 |
| PUT | `/pages/{id}` | 재이관 `{title, content, updatedAt, editorId?, editorName, changeNote, labels[]}` → 새 리비전 1건, updatedAt 원본 |
| PUT | `/pages/{id}/content` | `{content, bumpVersion: false}` → 버전 불변 본문 교체(현재 리비전 본문도 교체). `bumpVersion: true, changeNote` 면 새 리비전(링크 fixup) |
| PUT | `/pages/{id}/order` | `{sortOrder}` |
| POST | `/pages/{id}/attachments` | multipart `file` + `{filename, contentType, checksum, sourceVersion?}` → `{attachmentId, inlineUrl, downloadUrl, outcome: CREATED\|NEW_VERSION\|UNCHANGED}`(같은 이름·같은 checksum이면 UNCHANGED) |
| POST | `/pages/{id}/comments` | `{parentCommentId?, authorId?, authorName, body, createdAt}` → `{commentId}` (알림·자동 구독 없음) |
| GET | `/comments/{id}` | 존재 확인(재실행 시 삭제된 댓글 감지) |
| PUT | `/pages/{id}/restrictions` | `{view: [{type, id}], edit: [...]}` — 권한 검사·감사·자기 잠금 방지 없음(엔진이 fail-closed를 이미 적용) |
| GET | `/pages/{id}` | 검증용 `{title, type, contentLength, labels[], attachments[{id,filename,checksum}], commentCount, version}` |
| GET | `/spaces/{id}/pages?title=` | 제목 기반 링크 해석 보조(중복이면 여러 건) |
| GET | `/spaces/{id}` | 대상 스페이스 존재·이름 |
공통: 오류 `{"error"}`, 404/409 그대로. 트랜잭션 경계는 요청 단위. 모든 쓰기는 `WikiEvents.pageCreated/pageUpdated`(색인)만 발행하고 알림·watch·감사(감사는 `IMPORTED` 액션 1건은 남긴다)를 건너뛴다.

## 3. migration-service
- 리포 `migration-service`(GHCR `ghcr.io/chanho4702/migration-service`), Spring Boot·Java 24, 포트 9170(REST, 9140은 search-service와 충돌), DB `migrationdb`(compose `migration-db-init`, agent-service 온보딩 절차 그대로), common-starter(JWT 검증·오류 계약)·common-proto(org gRPC).
- Flyway V1: 기존 V6/V7/V34/V35/V36의 migration_* 테이블을 **새 번호로 재작성**(page 컬럼은 제외). 데이터 이전은 없다(dev 전용 잡뿐).
- 패키지 이동: `migration/**` 전부 + `schema/document-ir-v1.schema.json` + 픽스처·테스트(FakeConfluenceDcServer 포함). `ImportedPageWriter`·`MigrationAttachmentImporter`·`MigrationCommentImporter`·`MigrationRestrictionApplier`·`MigrationLinkFixupWriter`는 **WikiImportClient**(JDK HttpClient, `X-Internal-Token`) 호출로 바뀐다. MEDIA_COPY는 DC → 엔진 임시 파일 → 위키 업로드(스트리밍, 상한 그대로).
- REST `/api/migration/**`(기존 `/api/wiki/migrations/**`와 같은 계약, 접두사만 변경). 전역 관리자·대상 스페이스 ADMIN 판정은 org gRPC(`CheckPermission`)로 — 위키에 묻지 않는다.
- 테스트: 기존 파이프라인 테스트를 **가짜 위키 import 서버**(JDK HttpServer, 계약 §2를 그대로 흉내)로 옮긴다. 계약 드리프트 방지: 위키 쪽 `WikiImportContractTest`가 같은 JSON 픽스처를 검증.

## 4. 게이트웨이·인프라·프론트
- gateway: `/api/migration/**` → migration-service(JWT 필수, 기존 제로트러스트). `/internal/wiki/import/**`·`/internal/**`은 라우팅 안 함(주석).
- nginx: `/api/` 정규식이 이미 게이트웨이로 보낸다 — 변경 없음.
- compose: `migration-service`(+`migration-db-init`), env `WIKI_BACKEND_URI`·`WIKI_INTERNAL_TOKEN`·`ORG_GRPC_HOST`·DC 프로퍼티. wiki-backend에 `WIKI_INTERNAL_TOKEN`. deploy.yml 서비스 목록에 추가.
- wiki-front: 스토어 어댑터 base path만 `/api/migration`(목업 무변경), README.

## 5. 단계
- **X1 wiki-backend**: import API §2 + 내부 토큰 필터 + 계약 테스트. 기존 엔진은 아직 남긴 채(같은 내부 서비스 메서드를 API가 감싼다) — 두 경로가 같은 코드를 타게.
- **X2 migration-service**: 리포 생성·골격·엔진 이동·WikiImportClient·테스트 이관(가짜 위키 서버)·CI.
- **X3 배선**: gateway·compose·deploy·wiki-front base path·운영 가이드 이동(wiki-backend README → migration-service README). **완료(2026-09-05)** — infra a844957·gateway 63a48e6·migration-service d0e8b43/4ea8dfd, wiki-front 이 커밋. 게이트웨이 라우트 `migration`(`MIGRATION_SERVICE_URI`), compose `migration-service`+`migration-db-init`+스테이징 볼륨, `WIKI_INTERNAL_TOKEN`은 `.env`/`C:\deploy\platform.env`에 양쪽 같은 값. 포트는 9170(9140은 search-service).
- **X4 위키 정리**: `migration/**` 삭제, V37로 migration_* 테이블 제거(page.imported_* 유지), README·문서 갱신, docs 프로필의 `/api/wiki/migrations` 차단 제거.
X1과 X2는 병렬 가능(계약 §2 고정). X3·X4는 X2 뒤.

## 6. 열린 항목(기본값으로 진행)
- ⚠️ 첨부 대용량 스트리밍: X2에서 엔진→위키 업로드는 스트리밍, 위키 쪽 multipart 상한은 첨부 설정과 같게.
- ⚠️ 노션 정규화기도 함께 이동(현재 미주입 상태 그대로) — 라이브 노션 추출기는 여전히 범위 밖.
- ⚠️ 위키 import API를 향후 "이관 제품"이 외부에서 부를 수 있게 하려면 게이트웨이 노출+별도 토큰 스코프가 필요 — 지금은 내부망 전제.
