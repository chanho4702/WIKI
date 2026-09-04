# 컨플루언스 DC 마이그레이션 모듈 — M1 설계 (2026-09-05)

기획: `docs/roadmap/2026-09-05-confluence-dc-migration-module.md`(S1~S6, M-01~M-08, P1~P9). 전제: `docs/backend/2026-08-16-w14-content-collaboration-architecture.md`
ADR-W14-04(IR 계약)·ADR-W14-07(import-only, 단계별 체크포인트, 미매핑 제한 fail-closed). **G5(DC 지원 버전) 게이트는 2026-09-05 사용자
지시("설치형 마이그레이션 모듈이 목표")로 열린 것으로 본다** — P1 기본값(7.19 LTS~9.x, PAT) 적용, ⚠️ 실기 DC 실측 전까지 "보장" 문구는 쓰지 않는다.

## 0. M1 목표 — 파이프라인 완주

한 스페이스의 **페이지(type=page)** 트리·제목·본문·라벨·시각을 dry-run/import로 끝까지 옮기고, 재실행이 멱등이며, 관리 화면에서
연결 확인 → 발견 → 실행 → 진행률 → 보고서를 본다. 첨부 본체·링크 ID 재작성·제한·댓글·블로그는 M2/M3(핸들러는 자리만 두고 **경고로 보고**).

## 1. 백엔드 (wiki-backend)

### 1.1 데이터 (V34 `migration_source_payload`)
```
migration_source      (job_id PK FK→migration_job ON DELETE CASCADE, base_url VARCHAR(512), space_key VARCHAR(255),
                       auth_token TEXT NOT NULL, discovered_count INT NOT NULL DEFAULT 0, discovered_at TIMESTAMPTZ,
                       source_space_name VARCHAR(255), created_at, updated_at)
migration_payload     (id BIGSERIAL PK, item_id BIGINT NOT NULL FK→migration_item ON DELETE CASCADE, kind VARCHAR(16) NOT NULL
                       CHECK (kind IN ('SNAPSHOT','IR','MARKDOWN')), body TEXT NOT NULL, checksum CHAR(64) NOT NULL,
                       created_at, UNIQUE (item_id, kind))
```
- `auth_token`은 응답 DTO에 **절대 싣지 않는다**(P8). 저장은 평문 컬럼이되 DB 접근 통제로 보호 — 암호화 키 관리(ADR)는 후속.
  ⚠️ 코드 주석에 "평문, 후속 ADR"을 남긴다.
- `payload_ref`(기존 item 컬럼)는 이제 `dc:content/{id}` 같은 원본 참조 문자열이고, 실제 본문은 `migration_payload`가 든다.

### 1.2 DC 클라이언트 `migration/confluence/dc/ConfluenceDcClient`
JDK `java.net.http.HttpClient`(새 의존성 없음). `Authorization: Bearer <PAT>`. 타임아웃 연결 10s/읽기 60s.
| 용도 | 호출 |
|---|---|
| probe | `GET /rest/api/space/{key}?expand=homepage` → 이름·홈페이지 id. `GET /rest/api/content?spaceKey=&type=page&limit=1` → `size`/`totalSize`(없으면 발견 시 계산) |
| discover | `GET /rest/api/content?spaceKey={key}&type=page&status=current&expand=version,ancestors&start=&limit=100` 페이지네이션(`_links.next` 또는 size<limit 종료). 상한 `platform.wiki.migration.dc.max-pages`(기본 5000) |
| extract | `GET /rest/api/content/{id}?expand=body.storage,version,ancestors,history,metadata.labels,children.attachment` |
429/502/503/504·IOException → `MigrationStageException(retryable=true, code=DC_UNAVAILABLE)`; 401/403 → `DC_AUTH`(비재시도); 404 → `DC_NOT_FOUND`(비재시도, 항목 데드레터).
URL은 `base_url` + 고정 경로만 조합(원본 응답의 `_links`를 그대로 따라가지 않는다 — SSRF 방지). 리다이렉트 비허용.

### 1.3 API (`/api/wiki/migrations`, 기존 6개 유지)
| 메서드 | 경로 | 요청/응답 | 권한 |
|---|---|---|---|
| POST | `/confluence-dc/probe` | `{baseUrl, spaceKey, token}` → `{spaceName, homepageId, pageCount|null}` | 전역 관리자(기존 `/admin/*`와 같은 판정) |
| POST | `/` (확장) | 기존 필드 + `source?: {baseUrl, spaceKey, token}` (provider=CONFLUENCE_DC면 필수). `sourceInstanceId`는 서버가 `baseUrl` 호스트로 채워도 됨 | 대상 스페이스 ADMIN(기존) |
| POST | `/{jobId}/discover` | 원본 페이지를 BFS(조상 깊이 오름차순, 같은 깊이는 id 순)로 enqueue. 응답 `{discovered, enqueued, skipped}`; 이미 발견된 잡은 재발견 시 새 항목만 추가(멱등, sourceKey 유니크) | 동일 |
| GET | `/` | 관리자용 잡 목록(최신순 50) `[{id, provider, targetSpaceId, mode, status, createdAt, discoveredCount, sourceSpaceKey}]` | 전역 관리자 |
| GET | `/{jobId}/items?status=&stage=&page=` | 항목 페이지(50) — 대시보드의 실패 항목 표 | 동일 |
| GET | `/{jobId}` (확장) | 기존 + `source: {baseUrl, spaceKey, spaceName, discoveredCount}`(token 없음) + `counts: {byStatus, byStage}` | 동일 |
enqueue 항목: `externalObjectId=content.id`, `sourceVersion=version.number`, `sourceChecksum=sha256(id + ":" + version.number)`, `payloadRef=dc:content/{id}`.
dry-run/import는 잡 `mode`로 구분(기존). **start는 discover 뒤에만** 허용(항목 0이면 400 `MIGRATION_NOTHING_DISCOVERED`).

### 1.4 단계 핸들러 (provider=CONFLUENCE_DC) — `migration/confluence/handler/*`
| 단계 | 하는 일 | 출력/이슈 |
|---|---|---|
| EXTRACT | DC에서 content 조회 → **스냅샷 v1**(`fixtures/migration/confluence/confluence-page-snapshot-v1.json` 형태: `{snapshotVersion:1, capturedAt, content:{id,type,status,title,space{key,name},version{number,when},ancestors[],history{createdDate,createdBy{username,displayName,email?}},metadata{labels}, body{storage{value,representation}}, children{attachment{results[]}}}}`)를 `migration_payload(SNAPSHOT)`에 저장. `sourceVersion`이 enqueue 때와 다르면 WARNING `SOURCE_VERSION_DRIFT`(그대로 진행) | ok |
| NORMALIZE | SNAPSHOT → `ConfluenceStorageNormalizer.normalize` → `DocumentIrValidator.validate` → `migration_payload(IR)`. 정규화 이슈는 그대로 outcome issues. 검증 실패는 비재시도 실패 `IR_INVALID` | ok(issues) |
| MEDIA_COPY | **M1 자리표시**: IR `assets`마다 WARNING `ATTACHMENT_NOT_COPIED`(sourcePath=`attachment:{filename}`) | ok(issues) |
| RESOLVE | IR → 마크다운(`DocumentIrMarkdownWriter`) → `migration_payload(MARKDOWN)`. dry-run이면 여기까지. import면 **페이지 작성**(§1.5) → `MigrationObjectMappingWriter.upsert` → outcome.page(targetPageId). 부모 = 조상 마지막 항목의 object map → 없으면 루트에 두고 WARNING `PARENT_NOT_FOUND` | page |
| VERIFY | import: 대상 페이지 존재·제목 일치·본문 비어있지 않음·라벨 수 일치 확인, 불일치는 ERROR `VERIFY_*`. dry-run: MARKDOWN 페이로드 존재만 확인 | page |
멱등(재실행): RESOLVE에서 object map에 같은 `sourceKey`+같은 `sourceChecksum`이 있고 대상 페이지가 살아 있으면 **내용을 다시 쓰지 않고** 그 id를 반환(WARNING 없음). checksum이 다르면 제목·본문·라벨을 갱신(새 리비전, 변경 요약 "컨플루언스 재이관 v{n}").

### 1.5 페이지 작성 — `migration/confluence/ImportedPageWriter`
- `Page.imported(spaceId, parentId, title, content, authorId, createdAt, updatedAt)` 팩토리 추가(기존 `of` 옆). `status=PUBLISHED`, `type=PAGE`, `sortOrder`는 발견 순서(조상 내 형제 순은 DC `children.page` 순서가 없으므로 id 오름차순 — ⚠️ 원본 정렬 보존은 M2 후보).
- 시각: `createdAt=history.createdDate`, `updatedAt=version.when`. 작성자: `history.createdBy.email`이 있고 org-service에서 같은 이메일의 사용자를 찾으면 그 id(⚠️ `PrincipalDirectory`엔 이메일 조회가 없다 — `UserDirectory`/gRPC에 `findByEmail`이 이미 있으면 재사용, 없으면 M1은 **매핑 없이** 잡 요청자 id를 쓰고 WARNING `AUTHOR_UNMAPPED`(sourcePath=`user:{displayName}`)). P2의 "이관됨(원본 이름)" 표시는 M3.
- 리비전 1건 저장(`PageRevision.snapshotOf` + editorName=원본 displayName — 리비전 편집자 이름 스냅샷 V28을 그대로 활용해 **원본 작성자 이름이 이력에 남는다**).
- 라벨: `LabelService.replace`가 아니라 권한 검사 없는 내부 경로(같은 정규화 규칙)로 — 잡 요청자는 ADMIN이라 어느 쪽이든 통과하지만, 이벤트·알림은 쏘지 않는다(대량 생성이 구독자 알림 폭주가 되면 안 됨 → `WikiEvents.pageCreated` 생략, 검색 색인 이벤트만 발행 ⚠️ 색인 이벤트 이름은 search 모듈에서 확인).
- 제목 255자 초과는 잘라내고 WARNING `TITLE_TRUNCATED`. 같은 부모 아래 같은 제목은 허용(위키가 허용하면) — 아니면 " (2)" 접미사 + WARNING.

### 1.6 IR → 마크다운 `migration/ir/DocumentIrMarkdownWriter`
우리 저장 포맷(에디터 왕복 문법)으로만 쓴다. 표는 `wiki-front/src/features/wiki/editor/markdown.test.ts`·`lib/remark*.ts` 머리말이 정본.
| IR | 마크다운 |
|---|---|
| heading(level) | `#`×level, 4 이상은 `####` |
| paragraph / text+marks | bold `**`, italic `*`, strike `~~`, code `` ` ``, link `[t](href)`, textColor `:c[t]{.color}`(색 이름이 우리 팔레트에 없으면 마크 제거 + WARNING `MARK_DROPPED`), highlight `:bg[t]{.yellow}`, underline은 제거 + WARNING |
| bulletList/orderedList/listItem | `- ` / `1. `, 2칸 들여쓰기 |
| taskList/taskItem(checked) | `- [ ]` / `- [x]` |
| blockquote | `> ` |
| codeBlock(language) | 펜스 ```lang |
| table/tableRow/tableHeader/tableCell | GFM 표. 첫 행이 header면 구분선, 아니면 빈 헤더 행 삽입. 셀 안 블록은 공백으로 평탄화, `\|` 이스케이프. 병합 셀(colspan/rowspan attrs)은 우리 표 병합 문법이 있으면 그대로(⚠️ `lib/tableSpans.ts` 확인), 없으면 WARNING `TABLE_SPAN_DROPPED` |
| horizontalRule | `---` |
| hardBreak | 줄 끝 두 칸 공백 |
| panel(kind) | `> [!NOTE]`(info/note) `> [!TIP]`(tip/success) `> [!WARNING]`(warning) `> [!CAUTION]`(error). 제목이 있으면 첫 줄 굵게 |
| columns/column | `::::columns` / `:::column{width=N}` / `:::` / `::::` |
| image(asset) | M1: `![alt](attachment:{filename})` + 그 자산은 MEDIA_COPY 경고와 짝. 외부 URL 이미지는 `![alt](url)` |
| attachment | `[{filename}](attachment:{filename})` |
| pageLink(title) | `[[제목]]` — 우리 위키링크는 **제목 기준**(W21-2)이라 같은 스페이스로 옮겨진 문서는 M1에서도 열린다. 다른 스페이스 링크는 `[제목](원본URL)` + WARNING `LINK_EXTERNAL_SPACE` |
| mention | `@표시이름`(텍스트) |
| opaque(macro) | `> [!WARNING]` 패널 한 줄 "원본 매크로 `{name}`는 이관되지 않았습니다 (원본: {sourceRef.path})" + WARNING `MACRO_OPAQUE`(code당 집계) |
출력은 `parseMarkdown→serializeMarkdown` 왕복 후 의미가 같아야 한다 — 백엔드 테스트는 골든 파일로, 프론트 왕복은 M1 픽스처 3종을 `markdown.test.ts`에 추가해 고정한다.

### 1.7 테스트
- `ConfluenceDcClientTest`: JDK `com.sun.net.httpserver.HttpServer`로 가짜 DC(페이지네이션·429 재시도·401·리다이렉트 거부).
- 핸들러 5종 단위 + `ConfluenceDcPipelineTest`(SpringBootTest, 가짜 DC 서버 → discover → drain → 페이지 생성·라벨·시각·부모 검증 → 재실행 멱등 → checksum 변경 시 갱신) — 기존 `MigrationWorkerTest`의 `drain` 패턴.
- `DocumentIrMarkdownWriterTest` 골든 3종(기본 서식 / 표·패널·컬럼 / opaque·이미지·링크).
- `MigrationControllerTest`에 probe·discover·list·items 추가. Flyway 스키마 테스트 갱신.

## 2. 프론트 (wiki-front) — `/admin/migrations`

- 라우트 `/admin/migrations`(목록+새 잡) · `/admin/migrations/:jobId`(상세). 전역 관리자 판정·셸은 `/admin/search`(`SearchAdminPage`, `SettingsHeader`)와 같은 방식.
- 스토어(`wikiStore` 파사드 + `wikiApi` + `wikiMock`): `listMigrationJobs()`, `probeConfluenceDc({baseUrl, spaceKey, token})`, `createMigrationJob({provider:"CONFLUENCE_DC", targetSpaceId, mode, source})`, `discoverMigrationJob(id)`, `startMigrationJob(id)`, `cancelMigrationJob(id)`, `getMigrationJob(id)`, `getMigrationReport(id)`, `listMigrationItems(id, {status?, stage?, page?})`. 타입은 §1.3 응답 그대로(id는 string). 목업은 고정 시나리오(발견 12건 → start 후 폴링마다 3건씩 진행, 2건 WARNING·1건 데드레터).
- 화면: (1) 새 잡 폼 — DC URL·스페이스 키·토큰(`type=password`, 화면 재노출 없음)·대상 스페이스(Select, 빈 스페이스 권장 문구)·모드(dry-run 기본). "연결 확인" 버튼 → 스페이스 이름·페이지 수 표시(M-01). (2) 상세 — 원본 요약, 발견/시작/취소 버튼, 단계별·상태별 카운트(진행률 = DONE/전체), 5초 폴링(RUNNING일 때만), 손실 보고서(심각도순, code별 건수, sourcePath), 데드레터 표(항목·오류 코드), 완료 시 대상 스페이스 링크. 문구는 한국어, 오류는 `{"error"}` 메시지 그대로.
- 테스트: 스토어(목업 시나리오), `wikiApi.migrations.test.ts`(fetch 스텁·token이 요청 본문에만 가고 응답에 없음), 통합 `App.w29-migration-admin.test.tsx`(연결 확인 → 잡 생성 → 발견 → 시작 → 진행률·보고서).

## 3. 순서·경계
백엔드와 프론트는 §1.3 계약으로 병렬. 프론트는 목업으로 먼저 완성하고 REST 어댑터는 계약대로. 실기 DC 실측(G5 ⚠️)은 M1 병합 뒤 별도 — 그때 P1 버전 범위를 확정한다.

## 4. M2 — 첨부 본체·링크 재작성·페이지 제한·원본 정렬 (2026-09-05, M1 병합 뒤)

M1에서 경고로만 남긴 것을 실제로 옮긴다. 기획 Should 항목(S2·S3·M-06).

### 4.1 첨부 본체 (MEDIA_COPY)
- 원본 목록은 스냅샷 `children.attachment.results[]`(id·title(파일명)·metadata.mediaType·extensions.fileSize·version.number). 내려받기 URL은 원본 `_links.download`를 **따라가지 않고** 고정 패턴 `{baseUrl}/download/attachments/{pageId}/{filename}?version={n}&api=v2`로 조합(SSRF 규칙 유지). 크기 상한 `platform.wiki.migration.dc.max-attachment-bytes`(기본 100MB) — 초과는 WARNING `ATTACHMENT_TOO_LARGE`로 건너뛴다.
- MEDIA_COPY는 대상 페이지가 아직 없을 수 있다(RESOLVE 전). 그래서 **스테이징**: 바이트를 기존 `AttachmentStorage`(로컬/S3 라우터)에 `migration/{jobId}/{itemId}/{sha256}` 키로 저장하고, `migration_payload`에 kind `MEDIA_MANIFEST`(JSON: filename·contentType·size·checksum·storageKey·sourceVersion 배열)를 남긴다. V35: `migration_payload.kind` CHECK에 `MEDIA_MANIFEST` 추가. 같은 checksum이 이미 스테이징돼 있으면 재다운로드하지 않는다(재실행 멱등).
- RESOLVE(import): 페이지 생성 뒤 manifest의 항목마다 **첨부 레코드**를 만든다 — `AttachmentService`가 MultipartFile만 받으면 내부용 `registerStored(userId, pageId, filename, contentType, size, checksum, storageKey)` 경로를 추가해 스테이징 객체를 **이동/참조**(재업로드 금지). 같은 파일명 재이관은 "같은 이름 재업로드 = 새 버전" 규칙(W23)을 그대로 타되 checksum이 같으면 건너뛴다.
- 본문 참조 재작성: writer가 M1에 남긴 `attachment:{filename}`(이미지 `![alt](attachment:f)`·링크 `[f](attachment:f)`)를 첨부 레코드가 생긴 뒤 우리 위키가 쓰는 첨부 URL로 바꾼다 — **형식은 프론트 업로드 흐름이 본문에 쓰는 것과 동일해야 한다**(`attachment/AttachmentReferences.java`·wiki-front `lib/useResolvedWikiImage.ts`·`editor/components/UploadRail.tsx` 실측). 못 찾은 파일명은 그대로 두고 WARNING `ATTACHMENT_REF_UNRESOLVED`.
- dry-run: 다운로드하지 않고 목록·크기 합계만 보고서에(`ATTACHMENT_PLANNED` INFO — 심각도 enum에 INFO가 없으면 WARNING 대신 보고서의 별도 카운트 `plannedAttachmentBytes`로).

### 4.2 링크 재작성 (RESOLVE + 잡 마무리 pass)
- 정규화기가 남기는 링크 종류: `pageLink`(제목 기반 → `[[제목]]`, M1 그대로), `link` 마크의 href가 원본 사이트 URL인 것(`/pages/viewpage.action?pageId=N`, `/display/{KEY}/{Title}`, `/spaces/{KEY}/pages/N/...`).
- RESOLVE에서 href를 파싱해 pageId를 얻으면 object map으로 대상 페이지를 찾아 `/wiki/spaces/{sid}/pages/{pid}`(프론트 basename 포함 상대 경로)로 바꾼다. 아직 없으면 임시 스킴 `dc-page:{contentId}`로 쓴다(에디터 `Link.protocols`에 `dc-page` 추가 — wiki-front 한 줄).
- **마무리 pass**: `MigrationWorkerService.finalizeJobIfDrained`가 DONE으로 넘길 때 `MigrationLinkFixupService.run(jobId)` — 이 잡의 object map 대상 페이지 본문에서 `dc-page:{id}`를 다시 해석해 치환(새 리비전, 변경 요약 "이관 링크 정리"), 끝내 못 찾은 것은 원본 절대 URL로 되돌리고 WARNING `LINK_UNRESOLVED`(sourcePath=`link:{contentId}`). 제목 기반 `[[제목]]`이 대상 스페이스에서 여러 문서에 걸리면 WARNING `LINK_AMBIGUOUS`.
- 앵커(`#section`)는 우리 헤딩 slug 규칙(`rehype-slug`)과 같으면 유지, 아니면 앵커만 떼고 WARNING `ANCHOR_DROPPED`.

### 4.3 페이지 제한 → V12
- EXTRACT expand에 `restrictions.read.restrictions.user,restrictions.read.restrictions.group,restrictions.update.restrictions.user,restrictions.update.restrictions.group` 추가(DC 7.x/8.x 공통).
- 매핑: user → 이메일/username으로 org-service 조회(있는 조회 API만 사용 — `GrpcPrincipalDirectory`·`TeamDirectory` 실측; 없으면 `PermissionClient`의 사용자 검색을 확인), group → 팀(team) 이름 일치. **미매핑은 fail-closed**(ADR-W14-07): 그 제한은 잡 요청자 단독 제한으로 넣고 ERROR `RESTRICTION_PRINCIPAL_UNMAPPED`(sourcePath=`user:{name}`/`group:{name}`) — 공개로 완화하지 않는다. 제한 자체가 없는 페이지는 아무것도 하지 않는다.
- 적용은 `PageRestrictionService.replace`의 내부 경로(권한 검사·이벤트 없이)로, RESOLVE에서 페이지 생성 직후.

### 4.4 원본 정렬 보존
- discover가 부모마다 `GET /rest/api/content/{id}/child/page?limit=200&expand=version`(위치 순 반환)을 호출해 형제 순서를 `migration_item`에 기록(V35: `sibling_order INT NULL`). 루트는 `GET /rest/api/space/{key}/content/page?depth=root`. 호출 수는 부모 수만큼 — 상한 안에서 허용.
- ImportedPageWriter의 `sortOrder`는 `sibling_order` 순(없으면 M1 규칙). 재이관 시 순서가 바뀌면 `movePage`가 아니라 sortOrder만 갱신.

### 4.5 테스트·게이트
FakeConfluenceDcServer에 첨부 다운로드·child/page·restrictions 엔드포인트 추가. 파이프라인 테스트: 첨부 2건(이미지+PDF, 하나는 크기 초과) → 첨부 레코드·본문 URL 재작성·재실행 멱등 / 링크 3종(먼저 이관된 문서·나중 문서·없는 문서) → fixup 결과 / 제한(매핑됨·미매핑 fail-closed) / 형제 순서. `./gradlew test` 전체 그린(JAVA_HOME=jdk-24). wiki-front는 `Link.protocols` 한 줄과 `migrationLabels.ts`의 새 코드 문구, 골든 갱신 시 사본 동기화.

