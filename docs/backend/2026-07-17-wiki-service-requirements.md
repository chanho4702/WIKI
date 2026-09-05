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
| Page | id, spaceId, parentId(null=루트), **type**, **status**, title, body(마크다운 원문), position, createdBy, updatedBy, createdAt, updatedAt | parentId 인접 리스트, 깊이 제한 없음. type=`page`\|`folder`(기획 P1), status=`draft`\|`published`(P3) — **구현됨**(V2, JSON은 소문자). 폴더는 항상 published |
| Page(추가) | ownerId, verifiedAt, verifiedBy, verifiedUntil | **V33(W27-5)** 전부 nullable. ownerId는 기본값 없음 — createdBy를 복사하지 않는다("정하지 않음"이 유효한 상태). 소유자는 표시일 뿐 권한과 무관 |
| Page(추가) | importedAuthorName, importedSourceUrl | **V36(W29 M3)** 둘 다 nullable. 이관 문서에서 원본 작성자를 **우리 계정과 대조하지 못했을 때만** 값이 있다(대조되면 NULL). createdBy/updatedBy는 여전히 이관 담당자다 — 화면은 이 값이 있으면 작성자 자리에 "이관됨 · {원본 이름}"을 쓰고 원본 주소를 툴팁으로 붙인다 |
| SpaceWatch | spaceId, userId, createdAt | **V32(W27-4)** PK(spaceId,userId), 스페이스 삭제 cascade. 자동 구독 없음 |
| PageVersion | id, pageId, version(1부터), title, body, savedBy, savedAt | 페이지당 version 연속 증가 |
| Comment | id, pageId, authorId, body, parentId(null=최상위), createdAt, updatedAt(null=미수정) | **답글 중첩 1단** |

- 시각은 ISO-8601(UTC) 문자열로 반환 (프론트가 `toLocaleString("ko-KR")` 변환).

## 4. API 계약 (wikiStore 함수 → REST 매핑 제안)

> **2026-09-05 이관 모듈 분리(A안)**: 아래 이관 API는 위키가 아니라 **migration-service**(`/api/migration/**`, 게이트웨이 라우트)가 제공한다. 계약은 그대로이고 접두사만 바뀌었다(`/api/migration` → `/api/migration`). 위키에는 내부 import API(`/internal/wiki/import/**`)만 남는다 — `docs/superpowers/specs/2026-09-05-migration-service-split-design.md`.

| wikiStore 함수 | 메서드/경로 제안 | 비고 |
|---|---|---|
| listUsers() | GET /api/wiki/users | `{id, name}[]` |
| getCurrentUser() | (auth 백엔드) GET /api/me | 프론트에서 id 매핑 |
| listSpaces() | GET /api/wiki/spaces | |
| createSpace({key, name}) | POST /api/wiki/spaces | 키 대문자 정규화+중복 409 |
| listPages(spaceId) | GET /api/wiki/spaces/{spaceId}/pages | 전체 목록(트리 구성은 프론트) |
| getPage(id) | GET /api/wiki/pages/{id} | 없으면 404 |
| createPage({spaceId, parentId?, title, body?, type?, status?}) | POST /api/wiki/pages | **v1 스냅샷 자동 생성**. type/status 미지정 시 page/published |
| updatePage(id, {title?, body?}) | PATCH /api/wiki/pages/{id} | 실변경 시만 새 버전 스냅샷, 무변경 no-op |
| deletePage(id, {children?}) | DELETE /api/wiki/pages/{id}**?children=promote\|cascade** | 옵션 없이 하위 존재 시 409. promote=자식을 대상의 부모로 승격 후 대상만 삭제, cascade=후손 전부. 어느 쪽이든 지워지는 페이지의 버전·첨부 연쇄 삭제 — **구현됨** |
| publishPage(id) | POST /api/wiki/pages/{id}/publish | 초안→게시. 멱등, version·리비전 불변(내용 변경이 아님) — **구현됨** |
| movePage(id, {parentId, beforeId?}) | PUT /api/wiki/pages/{id}/position | 아래 이동 규칙 참조 |
| setPageIcon(id, icon\|null) | PUT /api/wiki/pages/{id}/icon | **V10** 이모지 아이콘(varchar). 메타데이터 변경 — 버전 스냅샷 없음, PageResponse·트리 응답에 `icon` 포함 |
| recordPageView(id) | POST /api/wiki/pages/{id}/views | **V10** 조회 1회 기록 → `{views}` 누적치. 실패해도 화면 진행(프론트가 조용히 무시) |
| listNotifications() | GET /api/wiki/notifications | **V11** `{unreadCount, items[{id,type,pageId,spaceId,pageTitle,actorId,createdAt,read}]}` 최신 30건. type: MENTIONED\|PAGE_UPDATED\|COMMENT\|SHARED\|PAGE_PUBLISHED(V32, 이메일 스위치는 pageUpdated 공용) |
| markNotificationsRead(ids?) | POST /api/wiki/notifications/read | **V11** ids 비우면 전체 읽음. 본인 행만 |
| listBlogPosts(spaceId) | GET /api/wiki/spaces/{id}/blog | **W24** `[{id,title,status,icon,createdBy,updatedBy,createdAt,updatedAt,excerpt}]` 최신순, 권한 필터. 글 생성은 POST /pages `type:"blog"`(parentId 있으면 400, move 400) |
| getNotificationPrefs() | GET /api/wiki/notifications/prefs | **V29** `{emailConfigured,email,emailEnabled,mentioned,pageUpdated,comment,shared}`. 없으면 기본값(모두 켜짐) 생성. email은 토큰 클레임 스냅샷 |
| updateNotificationPrefs(patch) | PUT /api/wiki/notifications/prefs | **V29/V31** `{emailEnabled,emailMode(IMMEDIATE\|DAILY),mentioned,pageUpdated,comment,shared}` → 같은 응답. 발송은 `WIKI_MAIL_HOST`가 있을 때만(emailConfigured). DAILY는 매일 `WIKI_MAIL_DIGEST_CRON`(기본 09:00)에 한 통 |
| downloadPagePdf(pageId, includeChildren, title) | GET /api/wiki/pages/{id}/export.pdf?includeChildren= | **W26** application/pdf 파일. 서버 렌더(flexmark+openhtmltopdf, NanumGothic 임베드), 하위 포함 시 트리 순서·가시성 필터, 100건 상한 |
| listSpaceDeletions() | GET /api/wiki/audit/space-deletions | **V30** 전역 관리자만. `audit_log`의 SPACE_DELETED 행(스페이스 FK를 풀어 삭제 뒤에도 남는다) |
| getPageRestrictions(pageId) | GET /api/wiki/pages/{id}/restrictions | **V12(W18)** `{view[], edit[], inherited[]}` — principal `{type: USER\|TEAM, id}`. 이름 해석은 프론트(org 디렉터리) |
| setPageRestrictions(pageId, {view, edit}) | PUT /api/wiki/pages/{id}/restrictions | **V12** 전체 교체. effective EDIT 통과자 또는 space ADMIN. 비ADMIN 셀프 락아웃 400 |
| listTeams() | GET /api/org/teams | org-service — 제한 다이얼로그 TEAM 주체 선택. 실패는 빈 목록 |
| getSpaceWatchState(spaceId) | GET /api/wiki/spaces/{id}/watch | **V32(W27-4)** `{watching}`. VIEW 권한 필요 — 못 보는 스페이스는 403 |
| setSpaceWatchState(spaceId, on) | PUT(또는 POST) / DELETE /api/wiki/spaces/{id}/watch | **V32** 같은 `{watching}` 응답. 자동 구독 없음. 알림 대상 = 페이지 구독자 ∪ 스페이스 구독자(중복 없음), 수신자별 effective VIEW로 한 번 더 거른다 |
| setPageOwner(pageId, userId\|null) | PUT /api/wiki/pages/{id}/owner | **V33(W27-5)** `{ownerId}` — null이면 해제. EDIT 권한. 메타데이터라 version·리비전 불변. 감사 로그 PAGE_OWNER_CHANGED |
| verifyPage(pageId, until?) | PUT /api/wiki/pages/{id}/verification | **V33** `{verifiedUntil: "YYYY-MM-DD"}` 또는 `{}`(기본 90일). verified_at=now, verified_by=호출자. 지난 날짜도 그대로 저장 — **만료 판정은 프론트**가 한다. 감사 로그 PAGE_VERIFIED |
| unverifyPage(pageId) | DELETE /api/wiki/pages/{id}/verification | **V33** 세 필드를 비운다. 감사 로그 PAGE_UNVERIFIED |
| probeConfluenceDc({baseUrl, spaceKey, token}) | POST /api/migration/confluence-dc/probe | **V34(W29)** 원본 DC 연결 확인 → `{spaceName, homepageId, pageCount\|null}`. **전역 관리자만**(GLOBAL grant — 감사 로그 space-deletions와 같은 판정). `pageCount`는 사이트가 총계를 안 주면 null. token은 요청 본문에만 — 어떤 응답에도 실리지 않는다. 실패: 401/403→403 "원본 컨플루언스 인증에 실패했습니다 — 토큰과 권한을 확인하세요", 404→404, 연결 불가/429/5xx→503, 3xx→400(리다이렉트 비허용), baseUrl이 http(s)가 아니면 400 |
| listMigrationJobs() | GET /api/migration | **V34** 최신순 50건 `[{id, provider, targetSpaceId, mode, status, createdAt, discoveredCount\|null, sourceSpaceKey\|null}]`. **전역 관리자만**. 원본이 없는 잡(예전 NOTION)은 뒤 두 필드가 null |
| createMigrationJob({provider, targetSpaceId, mode, source?}) | POST /api/migration | **V34 확장** 기존 필드 + `source: {baseUrl, spaceKey, token}`. provider=CONFLUENCE_DC면 source 필수(없으면 400 "원본 컨플루언스 접속 정보가 필요합니다"). `sourceInstanceId`는 이제 선택 — 비우면 서버가 baseUrl의 호스트로 채운다. 대상 스페이스 ADMIN |
| discoverMigrationJob(id) | POST /api/migration/{jobId}/discover | **V34** 원본 트리를 훑어 대기열을 채운다 → `{discovered, enqueued, skipped}`. 조상 깊이 오름차순·같은 깊이는 id 순으로 담는다(부모가 먼저 처리돼야 트리가 선다). **멱등** — 다시 눌러도 새 항목만 늘고 기존은 skipped로 센다. PENDING 잡만(아니면 409), CONFLUENCE_DC만(아니면 409). 상한 `platform.wiki.migration.dc.max-pages`(기본 5000). **M3부터 블로그 글(`type=blogpost`)도 발견 대상**이라 `discovered`에 함께 센다 |
| getMigrationJob(id) | GET /api/migration/{jobId} | **V34 확장** 기존 `MigrationJobResponse` 필드 전부 + `source: {baseUrl, spaceKey, spaceName, discoveredCount}\|null` + `counts: {byStatus: {...}, byStage: {...}}`. **source에 token 필드는 없다.** 진행률 = `counts.byStatus.COMPLETED / itemCount` |
| listMigrationItems(id, {status?, stage?, page?}) | GET /api/migration/{jobId}/items?status=&stage=&page= | **V34** `{items: MigrationItemResponse[], page, size, total}`. page는 0부터, size는 50 고정. status: PENDING\|RUNNING\|RETRY_WAIT\|COMPLETED\|DEAD_LETTER, stage: EXTRACT\|NORMALIZE\|MEDIA_COPY\|RESOLVE\|VERIFY\|DONE. 대상 스페이스 ADMIN |
| startMigrationJob(id) | POST /api/migration/{jobId}/start | **V34 확장** 항목이 0건이면 400 `{"error": "옮길 항목이 없습니다 — 먼저 원본 발견을 실행하세요"}`. 항목 0으로 시작하면 잡이 즉시 COMPLETED가 되어 "성공적으로 아무것도 안 옮겼다"가 되기 때문 |
| listVersions(pageId) | GET /api/wiki/pages/{pageId}/versions | version 내림차순 |
| restoreVersion(pageId, versionId, changeNote?) | POST /api/wiki/pages/{pageId}/revisions/{version}/restore | updatePage 경로 재사용(새 버전으로 쌓임). 어댑터는 `changeNote`가 있을 때만 본문 `{ changeNote }`를 싣는다 — **백엔드는 아직 본문을 읽지 않는다(후속: `RevisionController.restore`에 선택 본문 추가)**. 그때까지 백엔드 모드의 복원 버전에는 서버가 만든 문구가 남는다 |
| listComments(pageId) | GET /api/wiki/pages/{pageId}/comments | createdAt 오름차순 |
| addComment(pageId, body, parentId?) | POST /api/wiki/pages/{pageId}/comments | |
| updateComment(id, body) | PATCH /api/wiki/comments/{id} | **본인만** |
| deleteComment(id) | DELETE /api/wiki/comments/{id} | **본인만**, 답글 연쇄 삭제 |

### 4.1 이관 모듈(W29) — 프론트가 알아야 할 계약 밖 사실

- **토큰은 되돌아오지 않는다.** 연결 확인·잡 생성에서 보낸 PAT는 서버에 저장되고 어떤 응답 DTO에도
  실리지 않는다(기획 P8). 화면은 입력값을 다시 채워 줄 수 없으므로 수정 흐름은 "다시 입력"이다.
- **이관된 문서의 본문은 우리 마크다운 방언 그대로다.** 백엔드가 IR을 편집기 왕복의 고정점 형태로
  직렬화한다(대괄호 이스케이프·태스크 목록 빈 줄·표 병합 마커). 골든 파일 3종이
  `wiki-backend/src/test/resources/fixtures/migration/confluence/golden/*.md`에 있고,
  `editor/markdown.test.ts`가 같은 파일로 왕복을 고정한다.
- **첨부 본체는 M2부터 실제로 넘어온다.** 실제 이관에서는 본문의 `attachment:파일명` 참조가
  첨부 레코드의 주소로 바뀐다 — 이미지는 `/api/wiki/attachments/{id}/inline`, 그 밖의 파일은
  `/api/wiki/attachments/{id}`(내려받기)다. inline 엔드포인트는 이미지·PDF만 열어 주므로 문서 파일을
  inline으로 걸면 400이 난다. 크기 상한은 `platform.wiki.migration.dc.max-attachment-bytes`(기본 100MB)이고
  넘는 파일은 `ATTACHMENT_TOO_LARGE`로 건너뛴다.
  **시험 실행은 한 바이트도 받지 않는다** — 첨부는 `ATTACHMENT_PLANNED`(INFO)로만 보고되고, 그래서
  시험 실행의 본문 미리보기에는 이미지가 안내 문구로 남는다(실제 이관 결과와 다른 유일한 지점).
  `attachment:` 스킴은 `editor/extensions/base.ts`의 Link protocols에 등록돼 있어야 편집기 왕복에서
  살아남는다(참조가 남은 경우 대비).
- **원본 사이트 링크는 우리 주소로 바뀐다(M2).** `/pages/viewpage.action?pageId=N` ·
  `/spaces/{KEY}/pages/N/...` · `/display/{KEY}/{제목}` 세 꼴을 읽어 `/wiki/spaces/{spaceId}/pages/{pageId}`로
  바꾼다. 아직 안 옮긴 문서를 가리키면 임시 스킴 **`dc-page:{참조}`**로 남았다가, 잡이 끝날 때 도는
  마무리 pass가 다시 해석한다 — 그래서 `dc-page`도 Link protocols에 등록돼 있어야 한다. 정리 pass는
  **새 리비전**을 남기고 변경 요약은 `이관 링크 정리`다. 끝내 못 찾은 링크는 원본 절대 URL로 되돌리고
  `LINK_UNRESOLVED`, 같은 제목이 여럿이면 `LINK_AMBIGUOUS`, 앵커가 대상 헤딩과 안 맞으면
  `ANCHOR_DROPPED`로 보고한다.
- **블로그·댓글·이력·원본 작성자는 M3부터 넘어온다.**
  - 원본의 블로그 글은 `Page.type=blog`(W24)로 들어온다 — 부모가 없고 블로그 목록에서만 읽힌다.
    트리에는 뜨지 않는다. 타입이 어긋나면 `VERIFY_TYPE_MISMATCH`로 보고한다.
  - 원본 댓글은 전부 **페이지 댓글**로 들어온다. 작성자 id는 이관 담당자이고 이름은 원본 표시
    이름이다(`Comment.authorName` 스냅샷). 원본의 인라인 댓글은 앵커를 다시 찾을 수 없어 페이지
    댓글로 내리고 본문 앞에 `> 원문: "..."` 한 줄을 붙인다 — `INLINE_COMMENT_DEMOTED`.
    답글의 답글은 최상위 답글로 편다(`COMMENT_REPLY_FLATTENED`, 우리 중첩은 1단). 옮기지 못한
    댓글은 `COMMENT_NOT_MIGRATED`. **알림·구독은 발생하지 않는다.**
  - 원본의 지난 버전은 최신 N개까지 리비전으로 깔린다(`platform.wiki.migration.dc.history-versions`,
    기본 10, 0이면 현재본만). 오래된 것부터 1..k이고 현재본이 k+1 — 페이지 `version`도 그 값이다.
    리비전의 편집자 이름은 그 버전의 원본 편집자, 변경 요약은 원본의 버전 메시지다. 버전 하나가
    상한(`max-history-version-bytes`, 기본 2MB)을 넘거나 원본에서 사라졌으면
    `HISTORY_VERSION_SKIPPED`. **재이관은 이력을 다시 깔지 않는다**(새 리비전 한 건만).
  - 원본 작성자는 org-service의 이름 조회(`LookupMembers`, common-proto 0.15.0)로 우리 계정과
    대조한다. **찾으면 그 사용자가 문서의 작성자·수정자이고** `importedAuthorName`·`importedSourceUrl`은
    비어 있다(옮긴 댓글의 작성자도 같다). 못 찾으면 계정을 새로 만들지 않는 것이 이 모듈의 전제라
    잡 요청자를 작성자로 두고 두 필드가 채워진다(§3 엔티티 표, `AUTHOR_UNMAPPED`).
- **원본 페이지 제한은 fail-closed로 옮긴다(M2).** 원본의 보기·편집 제한을 그대로 옮기되, 사용자·그룹을
  우리 계정·팀으로 대조하지 못하면 **공개로 풀지 않고 잡 요청자 단독 제한**으로 닫고
  `RESTRICTION_PRINCIPAL_UNMAPPED`(ERROR)를 남긴다. 대조는 org-service의 이름 조회를 탄다 —
  화면은 "org에 계정·팀이 없는 사람이 걸린 문서는 관리자가 다시 열어야 한다"를 전제로 안내한다.
- **이관이 기대는 org-service gRPC 계약(common-proto 0.15.0).** 둘 다 trim + 대소문자 무시로
  대조하고 **매칭된 것만** 돌려준다(못 찾은 질의는 응답에서 빠진다). 활성 멤버만 보고, 한 질의에
  후보가 둘 이상이면 매칭으로 세지 않는다. 한 요청 상한은 200이고 넘으면 `INVALID_ARGUMENT`다.
  org 자체가 닿지 않으면(UNAVAILABLE·DEADLINE) 항목이 **재시도 가능한 실패**(`ORG_LOOKUP_UNAVAILABLE`)로
  남는다 — 미매핑으로 삼켜 잡을 성공시키지 않는다.

  | RPC | 요청 → 응답 | 쓰이는 곳 |
  |---|---|---|
  | `LookupMembers` | `emails[]` · `usernames[]`(= 이메일 local-part) → `MemberMatch{query, memberId, displayName, email}[]` | 원본 작성자·댓글 작성자·제한의 USER 주체 |
  | `LookupTeams` | `names[]` → `TeamMatch{query, teamId, name}[]` | 원본 그룹 → 제한의 TEAM 주체 |

- **형제 순서는 원본을 따른다(M2).** 발견이 부모마다 `child/page`를 한 번 더 불러 원본 순서를 읽고
  `sortOrder`에 반영한다. 재이관에서 순서만 바뀌면 문서를 다시 쓰지 않고 `sortOrder`만 갱신한다
  (리비전이 쌓이지 않는다).
- **`counts`는 0인 키를 담지 않는다.** group-by 결과라 아직 그 상태·단계에 도달한 항목이 없으면
  키 자체가 없다. 진행률은 `(counts.byStatus.COMPLETED ?? 0) / itemCount`로 계산한다.
- **손실 보고서 집계 shape**: `issues[]`는 `{severity, code, distinctPaths, occurrences, sampleSourcePath}`다.
  `sampleSourcePath`는 그 code가 난 위치 중 사전순 첫 번째 하나다(전체 목록이 아니다) —
  `MACRO_OPAQUE` 3건이 `macro:jira`인지 `macro:excerpt`인지 구분하는 용도이고, 위치 전량은
  `GET /{jobId}/items`로 본다.
- **손실 보고서 코드**(`GET /{jobId}/report`의 `issues[].code`) — 화면이 한국어로 매핑할 대상
  (`lib/migrationLabels.ts`의 `issueCodeLabel`): `MACRO_OPAQUE` · `MARK_DROPPED` ·
  `TABLE_SPAN_DROPPED` · `LINK_EXTERNAL_SPACE` · `LINK_ANCHOR_DROPPED` · `MEDIA_UNRESOLVED` ·
  `TITLE_TRUNCATED` · `PARENT_NOT_FOUND` · `AUTHOR_UNMAPPED` · `SOURCE_VERSION_DRIFT` · `VERIFY_*` ·
  `CONFLUENCE_*`(정규화기 코드), **M2 추가분**: `ATTACHMENT_PLANNED`(INFO) · `ATTACHMENT_TOO_LARGE` ·
  `ATTACHMENT_NOT_COPIED` · `ATTACHMENT_REF_UNRESOLVED` · `LINK_UNRESOLVED` · `LINK_AMBIGUOUS` ·
  `ANCHOR_DROPPED` · `RESTRICTION_PRINCIPAL_UNMAPPED`(ERROR). 데드레터의 `lastErrorCode`:
  `DC_UNAVAILABLE` · `DC_AUTH` · `DC_NOT_FOUND` · `DC_INVALID_RESPONSE` · `DC_REDIRECT_REFUSED` ·
  `DC_ATTACHMENT_TOO_LARGE` · `IR_INVALID` · `SNAPSHOT_INVALID` · `MIGRATION_PAYLOAD_MISSING` ·
  `STAGE_HANDLER_UNAVAILABLE` · `WORKER_LEASE_EXPIRED`.
- **`severity`에 `INFO`가 실제로 온다(M2).** M1까지는 WARNING·ERROR뿐이었다. 보고서 정렬(`severityRank`)과
  Lozenge 색 매핑이 INFO를 이미 알고 있으므로 화면 변경은 없지만, "손실 0건"을 `issues.length === 0`으로
  판정하면 시험 실행에서 첨부 예정 안내가 손실로 세어진다.
- **dry-run은 쓰기 0건이다.** 문서도 object map도 만들지 않고 마크다운 산출물까지만 남긴다.
- **재실행은 멱등이다.** 원본이 그대로면 문서도 리비전도 늘지 않고, 바뀌었으면 새 리비전으로
  갱신되며 변경 요약은 "컨플루언스 재이관 v{원본 버전}"이다.

## 5. 도메인 규칙 — 서버가 강제해야 하는 불변식

프론트 검증은 UX 보조일 뿐이다. 아래는 전부 서버에서 재검증:

**스페이스**
- key는 trim+대문자 정규화 후 저장, 중복 거부.

**페이지**
- 제목 trim 후 비어 있으면 거부. 부모는 같은 스페이스의 페이지여야 함.
- position은 형제(같은 spaceId+parentId) 내 정렬값. 생성 시 max+1.
- 삭제: `children` 미지정 + 하위 존재 시 409로 거부(호출 실수로 트리가 통째로 사라지지 않게 하는 기본값). `promote`면 자식을 대상의 부모로 올리고 대상만, `cascade`면 후손 전부. 지워지는 페이지의 버전·첨부는 연쇄 삭제. promote로 옮겨진 자식마다 `PageUpdated` 이벤트를 발행한다(색인 스테일 방지).
- 순환 가드: 재귀 삭제·조상 순회 모두 visited 셋을 쓴다 — `parent_id` 손상 데이터에서 무한 루프하지 않는다.

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
5. **페이지 너비 설정의 서버 저장 여부** (2026-07-17 W5 추가): 프론트는 노션식 "전체 너비" 토글을
   localStorage(사용자·기기별)로 구현했다. 컨플루언스처럼 페이지 자체의 메타데이터(모든 열람자 공통)로
   승격할지 결정 필요 — 승격 시 `Page.layout` 필드 추가 + updatePage 확장(버전 생성은 하지 않는 별도 계약 권장).
   스페이스 별표 즐겨찾기(`wiki.ui.starredSpaces`, W6 추가)도 동일하게 서버 사용자 설정 승격 대상이다.

## 8. 다음 웨이브 기능의 백엔드 요구 (W4에서 의도적으로 미룸)

- **이미지/첨부**: 파일 업로드 서비스(멀티파트), 페이지-첨부 연결, 본문에서 첨부 참조 규약,
  삭제 시 고아 파일 정리. (W4에서 프론트 구현을 보류한 유일한 이유가 백엔드 부재)
- **전문 검색 — 구현됨(2026-08-15)**: 별도 search-service의 `POST /api/search/graphql`을 사용한다.
  제목·본문·첨부파일명을 검색하고 org-service 권한 범위와 교집합을 취한다. `SearchHit.pageType=PAGE|FOLDER`
  로 페이지·폴더 경로를 구분하며 첨부 hit은 소속 `pageId`를 내려준다. 사이드바 제목 필터는 별도 로컬 기능으로 유지한다.
- **알림/감시 — 구현됨**: 페이지 watch(V15) + 스페이스 watch(V32, W27-4). 활동 피드(최근 업데이트).
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
