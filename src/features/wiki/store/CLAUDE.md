# store/ — 데이터 스토어 규약

`wikiStore.ts`는 **듀얼모드 파사드**다. 화면은 이 파일의 async 함수만 호출하고, 파사드가
백엔드 어댑터(`wikiApi.ts` → `api/*`)와 목업(`wikiMock.ts` → `mock/*`) 중 하나로 보낸다 — 두 구현은
같은 시그니처·같은 의미론을 지킨다. **함수 시그니처와 아래 의미론을 바꾸면 화면 전체에 파급된다.**
새 함수는 양쪽 도메인 모듈(`api/<도메인>.ts`·`mock/<도메인>.ts`)에 구현하고 배럴 두 곳과 wikiStore에
한 줄씩 더한다. `api/*`는 목업을 import하지 않는다(프로덕션 번들 경계). REST 매핑 제안: `docs/backend/2026-07-17-wiki-service-requirements.md`.

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
- **스페이스 구독(W27-4)**: `getSpaceWatchState`/`setSpaceWatchState`. 페이지 구독과 달리 **자동 구독이
  없다** — 스페이스에는 "관심의 사건"(만들기·편집·댓글)이 없다. 알림 대상은 페이지 구독자 ∪
  스페이스 구독자이고, 두 원장에 다 있어도 한 번만 간다. 새 문서 게시는 `page_published`로
  따로 알린다(게시 상태로 만든 문서와 초안→게시 전이, 폴더 제외). 그 대상은 **구독자만**이다 —
  본문 멘션은 넣지 않는다(문서 생성은 예전부터 멘션 알림의 트리거가 아니다).
- **소유자·검증(W27-5)**: `setPageOwner`/`verifyPage`/`unverifyPage`. 셋 다 메타데이터라 version·버전
  스냅샷·updatedAt을 건드리지 않는다(`setPageIcon`·`movePage`와 같은 취급). `Page.verifiedUntil`은
  **날짜만**(`YYYY-MM-DD`)이다 — API 어댑터가 서버 TIMESTAMPTZ를 잘라 넣는다. 시각을 그대로 두면
  만료 비교가 브라우저 타임존에 따라 하루씩 흔들려 두 모드가 갈린다. 만료 판정은 화면 몫이며
  (`lib/verification.ts`), 지난 날짜도 서버·목업 모두 그대로 저장한다.
- **마이그레이션(M1, 컨플루언스 DC)**: `probeConfluenceDc`·`listMigrationJobs`·`createMigrationJob`·
  `discoverMigrationJob`·`startMigrationJob`·`cancelMigrationJob`·`getMigrationJob`·`getMigrationReport`·
  `listMigrationItems`. 원본 토큰(PAT)은 **요청 본문에만** 실린다 — 응답 DTO에도, 목업 저장
  (`WikiData.migrations`)에도 자리가 없고 화면은 잡을 만든 뒤 입력칸을 비운다(설계 §1.1 P8).
  `listMigrationJobs`는 **403일 때만 null**을 준다(전역 관리자 아님) — 잡이 없는 것은 빈 배열이고,
  둘을 같게 다루면 권한 없는 화면과 빈 화면이 섞인다. 열거값은 백엔드 enum 이름 그대로
  들고 다니고(`DEAD_LETTER`·`MEDIA_COPY`), 한국어 번역은 `lib/migrationLabels.ts`가 표시 직전에만
  한다. `counts.byStatus`/`byStage`의 키도 그 이름인데, 서버 집계가 group-by라 **0인 키는 아예
  오지 않는다**(백엔드 계약 §4.1) — 진행률은 반드시 `(byStatus.COMPLETED ?? 0) / itemCount`로 읽고,
  집계를 순회하는 화면은 없는 키를 0으로 다룬다. 목업도 같은 규칙으로 0인 키를 만들지 않는다. 목업은 고정 시나리오다: 발견 12건, `getMigrationJob` 호출마다 3건씩
  진행, 2건 WARNING(`MACRO_OPAQUE`·`ATTACHMENT_NOT_COPIED`), 1건 데드레터(`DC_NOT_FOUND`),
  dry-run이면 `targetPageId`가 비어 페이지를 만들지 않았음을 드러낸다. **진행은 시간이 아니라
  폴링 횟수로 움직이고, `getMigrationReport`는 진행을 당기지 않는다** — 한 폴링에서 잡과 보고서를
  같이 읽는 화면이 서로 다른 시점을 보면 안 된다. 취소·완료 뒤에는 조회해도 더 나아가지 않는다.
- **조직(U4, org-service)**: `getOrgMe`·`searchUsers`·`orgApiFetch`.
  `getOrgMe()`는 `GET /api/org/me`이고 **전역 관리자 판정의 단일 근거**다 — `globalRoles`에
  `"ADMIN"`이 있으면 관리자다. 관리자 전용 엔드포인트를 찔러 성공 여부로 판단하지 않는다:
  그러면 그 서비스의 장애가 "관리자가 아님"으로 둔갑해 관리 메뉴가 통째로 사라진다.
  목업은 저장소에 `org.self`가 없으면 **활성 전역 관리자**를 준다(목업/dev에서도 관리 화면이
  열려야 한다). 테스트는 `app/testUtils`의 `seedOrgState`로 비관리자·승인 대기를 만든다.
  `searchUsers(q)`는 `GET /api/org/members?q=`(서버가 이름·이메일 부분일치, 기본 필터
  `status=ACTIVE&kind=HUMAN`)이고 **실패를 삼키지 않는다** — 검색이 안 되는 것과 결과가 없는
  것은 다르다. 멤버 전량(`GET /api/org/members`)은 백엔드 어댑터가 **진행 중 요청을 합치고 5분 TTL로
  캐시**한다(실패는 캐시하지 않음, 호출자마다 독립 사본). 그 위에 두 함수가 있다: `listUsers`는 **이름
  표시용**이라 장애를 빈 목록으로 접고(디렉터리 장애가 화면 전체를 죽이면 안 된다), `listSelectableUsers`는
  **선택 UI용**이라 던진다. `listTeams`도 선택 UI 전용이라 던진다 — 고르는 화면이 장애를 빈 목록으로
  받으면 "고를 대상이 없다"로 보여 잘못된 저장을 부른다(제한 다이얼로그는 배너로 원인을 보이고 저장을 막는다).
  `orgApiFetch`는 함수가 아니라 **HTTP 경로**를 부르는 소비자(`@chanho/org-admin`)를 위한
  인증 fetch다 — 백엔드 모드는 `sharedApiFetch`, 목업 모드는 `orgMockApi.ts`가 같은
  `/api/org/*` 경로 계약으로 답한다. 목업이 백엔드보다 관대하면 화면이 목업에서만 동작하므로,
  없는 것은 없는 대로 준다(팀원 역할 변경 400, 이력 빈 배열, 목록의 `inviteUrl`은 항상 null —
  서버는 토큰 해시만 저장해 링크를 되살릴 수 없고 재발송만 새 링크를 준다).
- **사람 프로필(F-07)**: `getPersonProfile(userId)`·`listPersonPages(userId, limit?)`.
  `getPersonProfile`은 org-service `GET /api/org/members/{id}`(상태 무관)이고 없는 사람(404)·숫자가 아닌 id는
  **null**, 그 밖의 실패는 던진다(장애를 "없는 사람"으로 보이지 않는다). `teams`에서 EVERYONE 팀은 뺀다.
  이메일·팀은 조직 전원 공개(사용자 결정), 비활성이면 화면이 이메일·팀을 숨기고 "비활성"과 문서만 보인다.
  `listPersonPages`는 제안 계약 `GET /api/wiki/users/{id}/pages`(백엔드 미구현) — 만들었거나 마지막으로 고친
  문서, 최근 수정순, 보관 제외, **호출자 기준 가시성**(초안 규칙 그대로 — 목업은 `canSeePage`). 404면 **null**
  (화면은 "아직 제공하지 않습니다"). 목업 이메일은 `{id}@example.com`, 팀은 시드 `teamMembers`.
  멘션 저장 문법은 숫자 id만 멘션으로 승격하므로(`user:\d+`, 서버와 같다) 목업 사용자(`u1`…)는 멘션 칩이 되지 않는다.
- **쪽 목록(2026-10)**: `listVersionPage`(버전 번호 커서, 최신부터)·`listCommentThreads`(스레드 단위,
  최신 스레드부터, kind `page`/`inline`)·`getVersionByNumber`. 전량 함수(`listVersions`·`listComments`)는
  **기존 호출자를 위해 그대로 둔다** — 쪽 함수로 몰래 바꾸면 그 호출자가 잘린 목록을 받는다. 쪽 목록의
  버전 메타에는 본문이 없다(title·body 빈 값, 백엔드와 같다). 댓글 커서는 화면에 불투명한 문자열이며
  목업 형식(`작성시각~id`)과 백엔드 형식이 달라도 된다 — 깨진 커서는 두 모드 모두 거부한다.
- **스페이스 라벨(V41)**: `setSpaceLabels(spaceId, labels)` 전량 교체, `Space.labels`는 어댑터·목업 모두
  언제나 배열(이름순). 문서 라벨(`setLabels`)과 **다른 원장**이다 — 디렉토리 분류이고 스페이스 ADMIN만
  바꾼다. 정규화 규칙은 문서 라벨과 같고(`normalizeLabel`), 상한 10개.
- **웨이브 2(2026-10-18) 계약**: 전부 **추가만**이라 구버전 서버·호출자와 호환된다.
  - `copyPage(id, {targetSpaceId?, targetParentId?})` — 둘 다 비우면 원본 옆. 대상 스페이스 편집 권한 403,
    다른 스페이스 부모 400, 보관 409(서버 판정, 목업도 같은 규칙). 거부 문구는 복제 대화상자 안에 보인다.
  - `listNotifications({before?, limit?, types?})` → `nextBefore`(불투명 커서). **nextBefore가 null일 때만
    끝**이다 — 빈 쪽이어도 커서가 있으면 이어 읽는다. `unreadCount`는 필터와 무관. 옵션이 없으면 예전 경로.
    알림 설정 `pagePublished`(없으면 `pageUpdated`를 따른다).
  - `listWatches()`/`unwatchMany({pageIds, spaceIds})` — 권한을 잃은 항목은 `hidden` + 제목 null.
  - `listMyDrafts(limit)` — 404(구버전 서버)면 null → 내 항목의 초안 탭을 숨긴다.
  - `Page.canEdit` — 단건 조회에서만 채워진다(그 밖은 null=모름). false일 때만 쓰기 어포던스를 숨긴다.
  - `SearchContentInput.pageTypes` — 라이트 검색만 받는다. 화면은 라이트 설치에서만 "블로그" 필터를 보인다.
  - `setTaskDone(page, line, done, expectedText?)` — 화면이 본 줄의 항목 text. 다르면 409.
  - `listBlogPostPage(space, {before?, limit})` — 다음 커서는 응답 헤더 `X-Next-Before`(빈 배열이어도 있으면
    계속). `listBlogPosts`(전부)는 그대로.
  - 보관 문서 쓰기는 어느 경로든 거부(서버 PageWriteGuard 문구) — 목업은 `mock/db.ts`의 `requireWritable`.
- **에러는 한국어 사용자 문구로 throw** — 화면이 메시지를 그대로 노출한다.
- **초안 가시성(2026-10-18 사용자 결정)**: 초안(`status: "draft"`)은 작성자·그 스페이스 관리자·전역 관리자만
  본다. 판정은 **조상 체인**이다 — 볼 수 없는 초안 아래의 하위 문서도 함께 가려진다. 서버(EffectivePermissionService)가
  강제하고, 목업은 `mock/db.ts`의 `canSeePage`로 모든 읽기 경로(getPage·조상·트리·하위 수·후손·최근·id 묶음·
  제목 조회·라벨·라벨 집계·백링크·블로그·내 작업·검색)에 같은 규칙을 적용한다. 남의 초안 단건 조회는 서버처럼
  제한 문서와 같은 문구("이 페이지를 볼 권한이 없습니다")로 거부한다. 검색은 `includeDrafts`일 때만 초안을
  포함한다(그래도 볼 수 있는 것만). 초안 알림은 작성자 외에게 보내지 않고, 목업은 초안 공유를 거부한다.
  화면은 `DraftBadge`로 "초안 — 나만 보임"(남의 초안을 보는 관리자에게는 "작성자·관리자만 보임")을 표시한다.
- **편집 세션 낙관적 락**: 화면은 로드 때 받은 `Page.version`을 `updatePage(...,
  { expectedVersion })`에 넘긴다. 제목·본문과 함께 `parentId`(현재 부모, null=루트)까지 넘기면 어댑터가
  PUT 전 사전 조회를 생략하고 PUT 응답을 그대로 쓴다(부모가 그사이 바뀌어 서버가 400을 주면 조회 경로로
  한 번 재시도). API 어댑터가 저장 직전 조회한 최신 버전으로 바꾸면 stale 편집이
  다른 사용자의 변경을 덮어쓰므로 금지한다. `PageConflictError`는 최신 서버본을 함께 보존한다.

## 목업 한정 사항

- `CURRENT_USER_ID`(mock/users.ts u1) 하드코딩 — 서버는 토큰 주체로 `createdBy` 등을 채운다.
- localStorage `wiki.v1` + 메모리 캐시(`mock/db.ts`), 손상 시 시드 재생성(`isWikiData` 검증 + `normalize` 구버전 보정).
- `__resetForTest()`는 테스트 전용(메모리 캐시만 초기화, localStorage 불변).

## `platformApi.ts` — 플랫폼 설치 옵션 (도메인 데이터 아님)

`GET /api/platform/features`(게이트웨이 소유)의 런타임 기능 플래그다. 위키 도메인 데이터가 아니라
**설치 옵션**이라 `wikiStore` 파사드를 타지 않고 자기 파일 안에서 듀얼모드를 끝낸다.

- **모르면 라이트다.** 404(구버전 게이트웨이)·401·네트워크 실패·JSON이 아닌 응답·공개 문서
  인스턴스가 전부 `LITE_FEATURES`로 접힌다. 반대로 접으면(모르면 풀스택) 통합 검색이 꺼진 설치에서
  죽은 관리 메뉴가 살아난다. 그래서 이 조회는 **던지지 않는다**.
- **세션 1회**만 묻는다(상단바·검색 화면·색인 관리가 같은 답을 본다). 설치 옵션은 배포 중에 바뀌지
  않는다. 실패도 캐시된다.
- 목업 기본값은 `opensearch`(현재 화면 그대로)다 — 목업/dev에서 관리 화면을 열어 볼 수 없으면 그
  화면을 개발할 수 없다. 라이트 화면 테스트는 `testUtils`의 `seedPlatformFeatures("lite")`로 주입한다.
- 화면은 훅(`lib/usePlatformFeatures.ts`)으로 읽는다. `null`은 "아직 모른다"이며 그동안 능력을
  **켜지 않는다** — 켜 두면 라이트 설치에서 메뉴가 한 번 깜빡이고 사라진다.

## 타입

`types.ts`(배럴) + `model/*.ts`가 도메인 모델의 원천 — 백엔드 계약 문서의 엔티티 표와 1:1을 유지한다.
화면·스토어는 계속 `./types`에서 import한다.
