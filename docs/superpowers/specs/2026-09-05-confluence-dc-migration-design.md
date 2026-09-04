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
