# W14 콘텐츠·공동편집·마이그레이션 아키텍처 결정 제안

- 작성일: 2026-08-16
- 상태: **제안됨(Proposed)** — 아래 결정 게이트 승인 전 런타임·DB 변경 금지
- 적용 범위: `wiki-front`, `wiki-backend`, 후속 collaboration service, `infra`
- 상위 요구사항: [Notion·Confluence DC 갭 분석](../roadmap/2026-08-16-notion-confluence-gap-analysis.md)

## 1. 목적

W15 이미지 저장, W17 실시간 공동 편집, W19 Notion·Confluence DC 가져오기가 서로 다른 콘텐츠
정본을 만들지 않도록 서비스 경계와 데이터 표현을 먼저 고정한다. 이 문서는 작업 기록이 아니라
후속 구현이 따라야 할 제품·백엔드 계약이다.

## 2. 기존 확정 결정과 이번 제안의 관계

기존 확정 결정은 그대로 유지한다.

- 게시된 페이지의 본문과 revision은 Markdown 문자열이다.
- 보기/편집을 분리한다.
- 명시적 저장 또는 게시 한 번이 revision 한 개를 만든다.
- raw HTML을 보기·편집 경로에서 실행하지 않는다.

이번 단계에서 `Page.content`, `PageRevision.content`, 프론트 `Page.body`를 JSON으로 바꾸지 않는다.
새 표현의 역할은 다음처럼 제한한다.

| 표현 | 역할 | 정본 여부 |
|---|---|---|
| Markdown | 게시된 페이지, 일반 편집, revision, 기본 export | 기존 정본 유지 |
| Yjs binary update/state | 여러 사용자가 편집하는 **공동 초안** | 공동 초안 세션의 정본 |
| Document IR v1 | 외부 원본 정규화, 손실 추적, 링크·첨부 재연결, 변환 fixture | import/interchange 계약 |
| 원본 payload | Notion block JSON, Confluence storage XHTML/XML | 감사·재변환용 불변 원본 |

공동 초안을 게시할 때만 `Yjs → ProseMirror JSON → Markdown` projection을 만들고 기존 저장 API를
통해 새 revision을 생성한다. projection이 지원하지 않는 노드를 발견하면 게시를 조용히 진행하지 않고
오류 또는 명시적 손실 확인을 요구한다.

## 3. 결정 제안

### ADR-W14-01 — 공동 편집은 별도 self-hosted WebSocket 서비스로 격리

**제안**

- CRDT는 Yjs를 사용한다.
- 서버 후보는 오픈소스 Hocuspocus를 우선 기술 검증한다.
- collaboration service는 Node/TypeScript 별도 서비스로 둔다. Spring MVC 요청 처리와 WebSocket
  세션·CRDT lifecycle을 한 프로세스에 섞지 않는다.
- 프론트는 현재 Tiptap 2.27.2와 호환되는 collaboration extension/provider 조합을 spike에서 고정한다.
- Redis는 다중 collaboration node fan-out과 awareness 전달에만 사용한다. 문서 영속 저장소로 쓰지 않는다.
- Yjs state/update는 binary 그대로 PostgreSQL 또는 전용 durable store에 저장한다. JSON으로 다시 만든
  Y.Doc은 history/merge 정보를 잃을 수 있으므로 primary persistence로 금지한다.

**이유**

- 현재 프론트가 Tiptap/ProseMirror를 사용해 Yjs 연결 비용이 가장 낮다.
- collaborative connection 수명주기와 수평 확장을 CRUD backend와 분리할 수 있다.
- 기존 Redis Streams 도메인 이벤트와 collaboration pub/sub를 키·권한·관측 지표 수준에서 구분할 수 있다.

**거부한 대안**

- 마지막 저장 승리: 현재 데이터 유실 문제를 해결하지 못한다.
- 편집 잠금만 사용: 장애 시 잠금 회수, 장시간 점유, 오프라인 병합 문제를 남긴다.
- Redis를 Yjs 정본으로 사용: eviction/운영 실수와 stream retention이 문서 durability에 직접 영향을 준다.
- 상용 Tiptap Cloud 기본 채택: 사내 Keycloak·Data Center 성격과 데이터 상주 요구를 먼저 검증해야 한다.

**기술 검증 통과 조건**

1. Tiptap 2.27.2와 선택한 Yjs/Hocuspocus 버전의 Markdown round-trip 회귀가 없다.
2. 두 브라우저의 동시 삽입·삭제·서식·테이블 편집이 수렴한다.
3. 30초 네트워크 단절과 collaboration node 재기동 뒤 승인된 편집이 복구된다.
4. 문서 초기화가 연결할 때마다 중복 적용되지 않는다.
5. 오픈소스/상용 패키지 경계와 배포 라이선스를 기록한다.

**1차 호환성 spike (2026-08-16)**

- `@tiptap/extension-collaboration`·`extension-collaboration-cursor` 2.27.2,
  `yjs` 13.6.32, `y-prosemirror` 1.3.7, `y-websocket` 3.1.0으로 버전을 고정했다.
- 전부 MIT 라이선스인 오픈소스 경로이며 Tiptap Cloud/상용 provider는 포함하지 않는다.
- 기존 위키 스키마를 공유하면서 StarterKit `history`를 끄고 Yjs undo manager만 쓰는 구성을 테스트로
  고정했다. 두 격리 문서에서 동시에 삽입한 update를 교환했을 때 같은 ProseMirror 문서로 수렴했다.
- 이 결과는 에디터 런타임 호환성만 통과한 것이다. 표 동시 편집, 실제 WebSocket 재접속,
  snapshot 복구와 Markdown publish round-trip은 collaboration service spike에서 계속 검증한다.

공식 Hocuspocus 문서는 Yjs binary를 primary 형태로 저장하고, Redis extension은 노드 간 동기화용이지
영속 저장용이 아니라고 명시한다.

### ADR-W14-02 — WebSocket 인증은 단기 collaboration ticket 사용

**제안**

1. 브라우저가 기존 access token으로 `POST /api/wiki/pages/{id}/collaboration-ticket`을 호출한다.
2. `wiki-backend`가 EDIT 권한을 확인한 뒤 page ID, user ID, permission, nonce, 60초 만료를 가진
   1회성 또는 짧은 수명의 서명 ticket을 발급한다.
3. collaboration service가 WebSocket upgrade 시 ticket을 검증하고 page room을 고정한다.
4. 연결 후 권한 변경/페이지 삭제 이벤트를 받으면 해당 세션을 종료한다.

**금지**

- access token을 WebSocket URL query string에 직접 넣어 proxy/access log에 남기는 방식
- 프론트가 보낸 user ID, space ID를 신뢰하는 방식
- ticket의 page ID와 실제 room name이 다른 연결

nginx와 gateway에는 upgrade header, idle timeout, connection limit, trusted proxy 설정이 필요하다.

### ADR-W14-03 — 공동 초안과 게시 revision을 분리

**제안 상태 모델**

| 상태 | 읽기 대상 | 쓰기 대상 | revision 생성 |
|---|---|---|---|
| 일반 보기 | `page.content` | 없음 | 없음 |
| 공동 편집 | Yjs collaboration document | Yjs update | 없음 |
| 자동 저장 | Yjs binary snapshot/update | collaboration store | 없음 |
| 게시/업데이트 | Yjs projection 검증 후 `page.content` | PostgreSQL transaction | 1개 |
| 초안 폐기 | 마지막 published content로 공동 초안 재초기화 | collaboration store | 없음 |

자동 저장이 revision을 무한히 만들지 않는다. 게시 트랜잭션은 collaboration document generation과
기준 page version을 함께 검사해, 게시 중 초기화·이전 session의 늦은 요청을 막는다.

### ADR-W14-04 — Document IR은 import/interchange 계약으로 도입

**제안**

- v1은 JSON Schema로 버전 관리한다.
- 모든 block은 provider와 무관한 stable ID를 가진다.
- 이미지·첨부 block에는 URL이 아니라 영속 `mediaId`를 둔다.
- 내부 링크는 변환 전에 external reference를, 연결 후 internal ID를 가질 수 있다.
- 지원하지 않는 block/macro는 `opaque` node와 `sourceRef`로 보존한다.
- raw payload는 IR에 직접 실행 가능한 HTML로 넣지 않고 별도 immutable source object에 저장한다.
- importer가 만든 warning/error는 IR 본문이 아니라 `migration_issue`에 기록한다.

**v1 필수 node 범위**

`doc`, `paragraph`, `heading`, `text`, `bulletList`, `orderedList`, `listItem`, `taskList`, `taskItem`,
`blockquote`, `codeBlock`, `table`, `tableRow`, `tableHeader`, `tableCell`, `horizontalRule`, `hardBreak`,
`panel`, `columns`, `column`, `image`, `attachment`, `pageLink`, `mention`, `opaque`.

v1이 표현하지 못하는 Notion database view와 Confluence custom macro는 `opaque`로 가져온다. 새 node를
추가할 때 schema version을 올릴지, 하위 호환 optional attrs로 처리할지 compatibility test로 결정한다.

### ADR-W14-05 — media는 S3 호환 저장소, 본문은 durable media ID

**결정 및 W15 단계 반영**

- 개발/통합 테스트는 `adobe/s3mock:5.1.0`, 운영은 별도 승인한 S3 호환 object storage를 사용한다.
- `wiki-backend`에 storage interface와 local/S3 adapter를 두고, DB 행의 backend/bucket/key/version으로 기존 객체를 읽는다.
- 본문과 IR은 bucket 이름, storage key, presigned URL을 알지 못하고 `mediaId`만 가진다.
- inline URL과 download URL은 VIEW 권한 확인 후 짧은 TTL로 발급하거나 backend가 안전하게 stream한다.
- DB에는 원본명, detected MIME, size, SHA-256, bucket/key/version, 상태를 저장한다.
- PNG/JPEG/GIF/WebP만 inline 허용하고 `nosniff`·same-origin 응답을 사용한다. SVG/HTML은 inline 금지한다.
- 객체 생성 후 DB transaction 실패는 rollback callback으로 삭제하고, DB 삭제 객체는 commit 뒤 삭제한다.
- 에디터 업로드는 `PENDING`으로 생성하고 페이지 저장 뒤 서버가 최신 본문의 durable media ID를 확인한 뒤
  `CONFIRMED`로 전환한다. 만료된 PENDING은 주기 작업이 본문을 다시 대조해 참조 중이면 확정하고 아니면 삭제한다.
- Compose의 wiki-backend는 고정 container name 없이 확장되고, 각 노드가 Eureka에 등록돼 gateway의
  `lb://wiki-backend` 후보가 된다. 신규 첨부는 노드 로컬이 아니라 모든 인스턴스가 같은 S3 API를 사용한다.
- callback 실패로 DB 행 없이 남은 storage 객체는 후속 inventory reconciliation으로 복구한다.

MinIO OSS는 공식 저장소가 archive/source-only 상태로 전환됐고 최종 community release 대상 보안 공지가
남아 있어 새 개발 의존성으로 채택하지 않는다. S3Mock 역시 운영 저장소가 아니라 API 계약 검증용이다.
운영 provider 선정 때 versioning, encryption, IAM, lifecycle, checksum, backup/restore를 별도 검증한다.

- [Adobe S3Mock 5.1.0 release](https://github.com/adobe/S3Mock/releases/tag/5.1.0)
- [MinIO official repository](https://github.com/minio/minio)
- [MinIO security advisory GHSA-jv87-32hw-hh99](https://github.com/minio/minio/security/advisories/GHSA-jv87-32hw-hh99)

Confluence DC도 다중 application node에서 첨부를 공유 파일시스템 또는 S3 object storage에 둔다.
현재 Docker named volume은 단일 호스트 개발 편의용이며 운영 정본으로 승격하지 않는다.

### ADR-W14-06 — page restriction은 space 권한보다 더 허용적일 수 없음

**제안 평가 순서**

1. org-service에서 기존 space `VIEW`/`EDIT`/`ADMIN`을 확인한다.
2. `wiki-backend`가 루트부터 현재 page까지 restriction을 계산한다.
3. space 권한이 없으면 page grant가 있어도 거부한다.
4. ancestor의 VIEW 제한은 descendant에 상속한다.
5. 현재 page의 EDIT 제한은 EDIT만 좁히며 VIEW를 암시적으로 주지 않는다.
6. ADMIN은 제한 관리가 가능하되, 비인가 콘텐츠의 본문을 감사 로그나 오류 메시지에 노출하지 않는다.

page restriction은 콘텐츠 계층에 강하게 결합되므로 `wiki-backend`가 소유한다. 사용자·그룹의 실재와
그룹 membership은 org-service가 소유한다. 검색·첨부·댓글·알림·collaboration ticket은 모두 같은
effective permission 함수를 사용해야 한다.

페이지 이동 전에는 이전/새 ancestor의 effective permission 차이를 계산한다. 이동 결과 접근권한을 잃는
사용자가 있으면 관리자에게 영향 범위를 보여주고 명시 확인을 받는다.

### ADR-W14-07 — 마이그레이션은 import-only + 재실행 가능한 job으로 시작

**제안**

- 1차 범위는 Notion/Confluence → 우리 Wiki의 단방향 import다.
- 원본의 external ID, version, checksum을 저장해 같은 입력을 멱등 처리한다.
- extract, normalize, media copy, link/restriction resolution, verify를 별도 단계로 둔다.
- 모든 단계는 item checkpoint와 retry count를 가지며 영구 실패는 DLQ/issue로 이동한다.
- 링크·첨부·사용자·그룹은 대상 ID가 만들어진 뒤 2차 pass에서 연결한다.
- 미매핑 restriction은 공개로 완화하지 않고 fail-closed한다.
- 증분 재동기화와 양방향 sync는 초기 import 검증 뒤 별도 ADR로 다룬다.

지원할 Confluence DC 버전 범위는 아직 확정하지 않는다. v1 fixture는 여러 버전에 공통인 storage XHTML
부분집합을 사용하고, connector 구현 전에 실제 고객/사내 인스턴스 버전을 받아 compatibility matrix를 만든다.

## 4. 서비스와 데이터 소유권

| 데이터/기능 | 소유 서비스 | 저장소 |
|---|---|---|
| published page/revision | `wiki-backend` | PostgreSQL Markdown |
| 공동 초안/Yjs state | collaboration service | PostgreSQL binary 또는 동등 durable store |
| presence | collaboration service | 메모리 + Redis TTL/fan-out |
| media metadata/권한 | `wiki-backend` | PostgreSQL |
| media bytes/import source/export | storage adapter | S3 호환 object storage |
| space role/principal/group | org-service | org PostgreSQL |
| page restriction | `wiki-backend` | wiki PostgreSQL |
| migration job/item/issue/map | migration worker + `wiki-backend` API | wiki PostgreSQL |
| 검색 projection | search-service | OpenSearch, 재생성 가능 |

Redis Streams는 기존 도메인 이벤트 계약을 유지한다. collaboration의 저지연 fan-out 채널과 키 공간을
분리하고, fan-out 메시지를 search-service consumer group에 섞지 않는다.

## 5. Document IR v1 호환 규칙

1. `schemaVersion`은 정수 `1`이다.
2. root node type은 `doc`이다.
3. document 안의 모든 block ID는 비어 있지 않고 유일하다.
4. text node는 `text`, 비-text container는 `content`를 사용한다.
5. image/attachment는 IR 안에 만료 URL을 저장하지 않고 `attrs.mediaId`를 사용한다.
6. opaque node는 `sourceRef.provider`, `objectId`, `sourceType`, `path`, `checksum`을 가진다.
7. 외부 page link는 `attrs.target.externalObjectId`, 연결된 link는 `internalPageId`를 가진다.
8. source payload와 checksum은 변환 후에도 변경하지 않는다.
9. importer는 알 수 없는 attrs를 버리지 않는다. renderer는 알 수 없는 attrs를 실행하지 않는다.
10. export/import round-trip에서 지원 node는 의미가 유지되고, opaque node는 sourceRef가 유지된다.

## 6. 다음 구현 전 게이트

| 게이트 | 승인 전 허용 | 승인 전 금지 |
|---|---|---|
| G1 collaboration 라이선스/호환성 | isolated spike, fixture test | production dependency 설치·배포 |
| G2 Markdown/IR 역할 | schema/fixture, import prototype | `Page.content` 타입 변경 |
| G3 object storage 운영자 | S3Mock dev compose와 S3 adapter | 운영 provider/bucket/IAM 생성 |
| G4 page restriction 의미론 | API/DB proposal, 권한 행렬 test | 기존 org action 의미 변경 |
| G5 DC 지원 버전 | 공통 fixture parser | 지원 버전 보장 문구·실데이터 import |

## 7. 검증 시나리오

- 같은 Markdown을 일반 편집기로 저장할 때 기존 revision/diff가 바뀌지 않는다.
- 공동 초안을 두 브라우저가 수정한 뒤 한 번 게시하면 revision은 정확히 한 개 증가한다.
- 연결 중 EDIT 권한을 잃은 사용자는 더 이상 update를 전파하지 못한다.
- 비인가 사용자는 page, search hit, attachment, comment, collaboration room 어디에서도 정보를 얻지 못한다.
- Notion 임시 파일 URL이 만료돼도 이미 복사한 `mediaId`로 본문이 유지된다.
- Confluence custom macro는 placeholder로 보이더라도 원본 `sourceRef`와 loss issue를 잃지 않는다.
- migration job을 두 번 실행해도 page/media/comment 수가 증가하지 않는다.

## 8. 참고 근거

- [Tiptap Collaboration 설치](https://tiptap.dev/docs/collaboration/getting-started/install)
- [Hocuspocus persistence](https://tiptap.dev/docs/hocuspocus/guides/persistence)
- [Hocuspocus Redis extension](https://tiptap.dev/docs/hocuspocus/server/extensions/redis)
- [Notion API 파일 조회](https://developers.notion.com/guides/data-apis/retrieving-files)
- [Confluence storage format](https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html)
- [Confluence DC clustering](https://confluence.atlassian.com/doc/confluence-data-center-technical-overview-790795847.html)
