# Wiki 제품 요구사항 및 Notion·Confluence DC 갭 분석

> 작성일: 2026-08-16  
> 상태: 구현 백로그 정본  
> 범위: `wiki-front`, `wiki-backend`, 검색·인증·조직·인프라 경계  
> 선행 문서: [기능 요구사항 원본](2026-07-21-feature-checklist.md), [플랫폼 로드맵](2026-07-17-platform-roadmap.md)

## 1. 결론

현재 Wiki는 **스페이스·페이지 트리·리치 에디터·버전·검색을 갖춘 단일 사용자 중심 MVP**다.
Notion·Confluence Data Center 수준으로 부르려면 아래 여섯 영역이 먼저 닫혀야 한다.

1. 오래 열린 편집본을 실제로 막는 충돌 처리
2. 드래그·붙여넣기 이미지 업로드와 공유 스토리지
3. 서버에 영속되는 댓글·멘션·알림
4. WebSocket/CRDT 기반 실시간 공동 편집과 공유 초안
5. 페이지 단위 제한과 권한 상속
6. Notion·Confluence 원본을 손실 추적하며 옮길 수 있는 중간 문서 모델과 마이그레이션 잡

이 문서의 `P0`는 현재 MVP의 장애 등급이 아니라, **“Notion·Confluence급” 출시를 막는 등급**이다.
Notion 데이터베이스 전체를 첫 출시의 필수 조건으로 잡지는 않는다. 데이터베이스·다중 뷰·수식·롤업은
Wiki 핵심과 분리한 확장 트랙으로 진행한다.

## 2. 비교 기준

### Notion에서 가져와야 할 최소 기준

- 블록/페이지 계층, 내부 링크와 백링크
- 여러 사용자의 동시 편집, 커서·접속자 표시, 변경의 즉시 반영
- 페이지·본문 구간 댓글, 답글, 해결/재개, 멘션과 알림
- 사용자·그룹·팀스페이스별 보기/댓글/편집/공유 권한과 상속
- 페이지·데이터베이스·워크스페이스 내보내기와 첨부 자산 보존
- 오프라인 편집 후 재연결 동기화
- 별도 확장 트랙: 데이터베이스 속성, 필터·정렬·그룹, 다중 뷰, 관계·롤업·수식

### Confluence Data Center에서 가져와야 할 최소 기준

- 스페이스, 페이지 트리, 이동·복제·휴지통, 라벨, 템플릿
- 공동 초안, 자동 저장·동기화, 접속자 표시, 게시/초안 분리
- 글로벌·스페이스·페이지 제한과 상속
- 페이지 버전, 임의 버전 비교, 복원, 변경 요약
- 첨부파일 버전·권한·공유 저장소와 다중 노드 안전성
- XHTML 기반 storage format, 매크로, 리소스 참조, 첨부를 보존하는 DC 가져오기

공식 근거는 [Notion 공동 작업](https://www.notion.com/help/collaborate-with-people),
[Notion 공유와 권한](https://www.notion.com/en-gb/help/sharing-and-permissions),
[Notion 댓글·멘션](https://www.notion.com/en-gb/help/comments-mentions-and-reminders),
[Notion 데이터베이스](https://www.notion.com/help/category/databases),
[Notion 오프라인 페이지](https://www.notion.com/en-gb/help/use-pages-offline),
[Confluence 공동 편집](https://confluence.atlassian.com/doc/collaborative-editing-858771779.html),
[Confluence 페이지 히스토리](https://confluence.atlassian.com/doc/page-history-and-page-comparison-views-139379.html),
[Confluence DC 클러스터 구조](https://confluence.atlassian.com/doc/confluence-data-center-technical-overview-790795847.html)를 기준으로 했다.

## 3. 상태 표기

| 표기 | 의미 |
|---|---|
| ✅ 검증 | 코드와 테스트 또는 현재 실행 경로로 확인 |
| ⚠️ 결함/부분 | 일부 구현됐지만 운영 요구사항을 충족하지 못함 |
| ❌ 없음 | 대응하는 제품 기능 또는 인프라가 없음 |
| ⏸ 분리 | 첫 Wiki 동등성 범위에서 의도적으로 후순위 트랙으로 분리 |

## 4. 현재 기능 갭

### 4.1 콘텐츠·탐색

| 요구사항 | 상태 | 현재 판단과 보충 요구사항 |
|---|---:|---|
| 스페이스 목록·생성 | ✅ | 프론트와 백엔드가 연결됨 |
| 스페이스 설정·삭제 | ⚠️ | 백엔드 API는 있으나 프론트 adapter/UI 경로가 없고 보관과 영구 삭제가 구분되지 않음 |
| 페이지 생성·조회·편집·삭제 | ✅ | Markdown 저장과 Tiptap 편집 경로가 동작함 |
| 페이지/폴더 트리와 계층 이동 | ⚠️ | 부모 변경은 서버에 저장되지만 형제 순서는 서버 계약에 없어 재접속·다중 사용자 일관성을 보장하지 못함 |
| 페이지 복제 | ❌ | 하위 페이지·첨부·권한 복제 범위를 포함한 정책 필요 |
| 휴지통·복원·보존 기간 | ❌ | 현재 삭제는 hard delete이며 페이지·첨부를 즉시 제거함 |
| 최근 본 페이지·즐겨찾기 | ⚠️ | 브라우저 로컬 환경에만 저장되어 사용자·기기 간 동기화되지 않음 |
| 라벨/태그·백링크 | ❌ | 검색·마이그레이션 시 중요한 탐색 메타데이터이므로 서버 모델 필요 |
| 전역/본문/첨부 검색 | ⚠️ | 구현과 테스트는 있으나 관련 프론트·검색 응답 변경이 기능 브랜치에 남아 있어 main 통합 확인 필요 |
| 권한이 반영된 검색 | ⚠️ | 스페이스 범위 필터 기반. 페이지 제한 도입 후 문서 단위 누출 방지 테스트가 추가돼야 함 |

### 4.2 에디터·문서 모델

| 요구사항 | 상태 | 현재 판단과 보충 요구사항 |
|---|---:|---|
| 제목·목록·체크박스·인용·코드·표·링크·이모지 | ✅ | 에디터와 Markdown 렌더러에서 지원 |
| 패널·다중 컬럼·내부 페이지 링크 | ✅ | 확장 Markdown 문법과 `[[페이지]]` 경로가 있음 |
| 표 행/열 편집 UX | ✅ | 편집 메뉴와 테스트가 있음 |
| 이미지 URL 삽입 | ✅ | 슬래시/상단 메뉴에서 URL 프롬프트로 삽입 |
| 이미지 파일 드롭·붙여넣기·업로드 | ✅ | 파일 선택·drop·clipboard paste가 같은 업로드 파이프라인과 서버 MIME 판정을 사용 |
| 자동 저장 | ❌ | 명시적 저장과 `beforeunload` 경고만 있음 |
| 안정적인 블록 식별자 | ❌ | 인라인 댓글·CRDT·마이그레이션 참조를 위한 stable block ID가 없음 |
| 버전이 있는 정규 문서 IR | ❌ | Markdown만으로는 Confluence 매크로와 Notion 고급 블록을 무손실 보존할 수 없음 |
| 오프라인 편집·재연결 병합 | ❌ | 로컬 캐시/업데이트 큐/충돌 병합 정책 없음 |

### 4.3 버전·수명주기·거버넌스

| 요구사항 | 상태 | 현재 판단과 보충 요구사항 |
|---|---:|---|
| 버전 목록·비교·복원 | ✅ | 서버 revision과 프론트 diff/restore 경로가 연결됨 |
| 변경 요약 | ❌ | 저장/복원 사유와 변경 코멘트 모델 없음 |
| 작성자·수정자·시간의 완전한 표시 | ⚠️ | 백엔드 응답의 사용자 표시정보·시간 폴백이 일부 불완전함 |
| 초안/게시 상태 | ⚠️ | 신규 페이지 초안과 게시 상태는 있으나 공동 초안·게시 전 변경 묶음은 없음 |
| 콘텐츠 소유자·검증 만료 | ⏸ | 지식 신뢰도 기능으로 P2에서 별도 설계 |
| 감사 로그·보존 정책 | ❌ | 권한 변경, 공유, 삭제, 마이그레이션을 포함한 감사 이벤트/조회가 없음 |

### 4.4 협업

| 요구사항 | 상태 | 현재 판단과 보충 요구사항 |
|---|---:|---|
| 낙관적 잠금 | ⚠️ | 백엔드는 `expectedVersion` 불일치에 409를 내지만 프론트가 저장 직전 최신 버전을 다시 조회해 오래된 편집본도 통과 가능 |
| 실시간 공동 편집 | ❌ | CRDT/OT, collaboration 서버, WebSocket 경로가 없음 |
| 접속자·커서·선택 영역 | ❌ | presence 프로토콜과 세션 수명주기 없음 |
| 자동 저장·공유 초안 | ❌ | 로컬 dirty 상태와 수동 저장만 존재 |
| 페이지 댓글·답글 | ⚠️ | UI는 있으나 백엔드 모드에서도 `wikiMock`의 `localStorage`를 사용함 |
| 인라인 댓글·해결/재개 | ❌ | block/range anchor, thread 상태, 재배치 정책 없음 |
| 사용자/페이지 멘션 | ❌ | 사용자 검색, 문서 참조, 알림 이벤트가 없음 |
| watch·받은 알림·읽음 상태 | ❌ | 구독과 전달 채널, 읽음 커서가 없음 |
| 리액션 | ❌ | 후순위지만 댓글 API 모델 확장성은 확보해야 함 |

### 4.5 권한·공유

| 요구사항 | 상태 | 현재 판단과 보충 요구사항 |
|---|---:|---|
| Keycloak 로그인/로그아웃 | ✅ | 플랫폼 확정 인증 설계를 사용함 |
| 스페이스 VIEW/EDIT/ADMIN | ✅ | org-service gRPC 권한 확인과 fail-closed 경로가 있음 |
| 페이지별 보기/편집 제한 | ❌ | Confluence DC 이전 시 restriction을 보존할 목적지 모델이 없음 |
| 그룹·사용자 권한 상속 | ❌ | 부모에서 상속되는 제한, 명시 허용/차단, 이동 시 재계산 정책 없음 |
| 댓글 전용·읽기 전용 역할 | ⚠️ | 스페이스 action은 있으나 제품 UI와 페이지 단위 권한 표현이 부족함 |
| 외부 게스트·공개 링크·만료 | ⏸ | 내부 플랫폼 우선. 필요 시 보안 ADR 후 별도 트랙 |

### 4.6 이미지·첨부

| 요구사항 | 상태 | 현재 판단과 보충 요구사항 |
|---|---:|---|
| 첨부 업로드·목록·삭제 API | ✅ | multipart API, 권한 확인, storage 위치와 SHA-256 메타데이터가 있음 |
| 첨부 다운로드 | ✅ | 보안을 위해 `Content-Disposition: attachment`로 강제 다운로드 |
| 본문 인라인 이미지 전달 | ✅ | 본문에는 host 없는 attachment ID 경로를 저장하고 편집·보기는 인증 fetch→Blob URL로 렌더 |
| 공유 오브젝트 스토리지 | ⚠️ | local/S3 adapter와 S3Mock dev 구성을 구현. 운영 provider 선정·다중 노드 검증은 남음 |
| 업로드 진행률·재시도·취소 | ✅ | XHR 바이트 진행률, AbortSignal 취소, 401 refresh 1회 재전송, 실패/취소 인라인 재시도 레일 구현 |
| MIME 검증·악성 파일 검사 | ⚠️ | magic byte MIME 판정과 inline allowlist는 구현. AV/CDR·이미지 decoder 검증은 남음 |
| 썸네일·EXIF 제거·변환 | ❌ | 원본/파생 자산과 작업 상태 모델 없음 |
| 고아 파일 정리·보존 | ⚠️ | rollback/after-commit 보상과 PENDING→CONFIRMED·만료 reconciliation 구현. DB 행 없이 남은 storage 객체 inventory 대조는 남음 |
| 백업·복원 검증 | ❌ | DB와 첨부 저장소를 같은 시점으로 복원하는 훈련과 무결성 검사 없음 |

### 4.7 마이그레이션·상호운용

| 요구사항 | 상태 | 현재 판단과 보충 요구사항 |
|---|---:|---|
| Notion 페이지/블록 가져오기 | ❌ | API pagination, block tree, rate limit, 임시 파일 URL 처리 없음 |
| Notion 데이터베이스 가져오기 | ⏸ | 속성·뷰·relation·rollup·formula를 별도 확장 트랙으로 분리 |
| Confluence DC space/page 가져오기 | ❌ | REST/XML 추출기와 ancestor 트리 재구성 없음 |
| Confluence storage XHTML/매크로 | ❌ | 정규 IR과 지원 불가 노드 보존 방식이 없음 |
| 첨부 버전과 본문 참조 재작성 | ❌ | 외부 ID→내부 ID 매핑과 체크섬 기반 중복 제거 없음 |
| 사용자·그룹·권한 매핑 | ❌ | 미매핑 사용자와 restriction의 안전한 기본값이 없음 |
| dry-run·재개·멱등성 | ❌ | migration job/checkpoint/retry/DLQ/audit 모델 없음 |
| 손실 보고서 | ❌ | 누락·대체·원문 보존 여부를 페이지별로 설명할 수 없음 |
| 우리 Wiki 내보내기 | ❌ | Markdown/HTML/PDF와 첨부 manifest를 포함한 탈출 경로 없음 |

Confluence는 페이지·템플릿·댓글을 커스텀 요소가 포함된 XHTML 계열 storage format으로 저장한다.
Notion API의 업로드 파일 URL은 짧게 만료되는 signed URL이므로 마이그레이션 중 즉시 다운로드하거나
재조회해야 한다. 따라서 Markdown 문자열 하나만을 정본으로 두는 가져오기 방식은 허용하지 않는다.

## 5. 확정 결함 백로그

### P0 — 동등성 출시 차단

#### WIKI-P0-001 오래된 편집본 충돌이 감지되지 않음

- 근거: `wikiApi.updatePage()`가 저장 직전에 `getPage()`를 호출하고 그 응답의 `version`을 PUT한다.
- 실패 시나리오: A와 B가 v3을 열고 B가 v4를 저장한 뒤 A가 저장하면, A도 v4를 다시 조회해 보내므로
  서버 409가 나지 않고 B의 변경을 덮어쓴다.
- 현재 보충: 편집 화면이 load-time version을 세션 기준으로 유지해 PUT하고, 409에서 로컬 에디터를
  보존한다. 최신 서버본과 내 저장 시도 본문을 나란히 비교하고 양쪽 복사, 서버본 재로드, 최신 버전을
  기준으로 한 명시적 수동 병합을 선택할 수 있다. mock 두 세션과 API 요청 계약 테스트가 stale 저장을 고정한다.
- 인수조건:
  - 편집 시작 또는 마지막 성공 저장 시 받은 버전을 편집 세션이 유지한다.
  - 409 시 로컬 편집 내용은 사라지지 않는다.
  - 사용자는 서버본 비교, 내 변경 복사, 새로고침, 수동 병합 중 하나를 선택할 수 있다.
  - 두 브라우저로 같은 버전을 편집하는 통합 테스트가 두 번째 stale 저장의 409를 검증한다.

#### WIKI-P0-002 이미지 업로드 경로가 에디터와 분리됨

- 현재: 파일 선택·drag/drop·clipboard paste가 `uploadAttachment()` 하나를 사용하고, 본문에는
  `/api/wiki/attachments/{id}/inline`만 저장한다. VIEW 권한 fetch 결과를 Blob URL로 렌더한다.
- 현재 보충: 바이트 진행률·취소·재시도와 실패 placeholder를 에디터 전송 레일로 제공한다. 에디터 업로드는
  `PENDING`으로 만들고 페이지 저장 뒤 본문에 남은 ID만 `CONFIRMED`로 바꾼다. 브라우저 강제 종료나
  확정 요청 유실은 만료 reconciliation이 최신 본문을 다시 검사해 참조된 이미지는 확정하고 고아만 삭제한다.
- 잔여 위험: object delete callback 자체가 계속 실패해 DB 행 없이 남은 storage 객체의 inventory 대조,
  인증 포함 node A upload→node B inline black-box 검증, AV/CDR·파생 이미지 처리.
- 인수조건:
  - 파일 선택, drag/drop, clipboard paste가 같은 업로드 파이프라인을 사용한다.
  - 진행률, 취소, 재시도, 실패 placeholder가 표시된다.
  - 본문에는 만료 URL이 아니라 영속 media ID 또는 내부 URI가 저장된다.
  - 허용된 이미지 MIME만 안전한 inline 응답 또는 짧은 signed URL로 제공한다.
  - 문서 저장 실패·이미지 삭제·페이지 삭제의 고아 자산 정책을 테스트한다.

#### WIKI-P0-003 첨부가 로컬 단일 노드에 묶임

- 현재: DB 행별 `LOCAL`/`S3` routing, bucket/key/version/checksum, S3 adapter와 S3Mock 개발 구성이 구현됐다.
  Compose에서 실제 wiki-backend 2개가 healthy/Eureka `UP`으로 등록됐고, 독립 writer/reader S3 client가
  같은 versioned object를 저장·조회·삭제하는 통합 테스트가 통과한다.
- 잔여 위험: 운영 provider/IAM/백업이 미결정이고 인증 REST를 통한 노드 강제 전환 검증과 객체
  inventory reconciliation이 없다.
- 인수조건:
  - 개발은 고정 버전 S3Mock, 운영은 승인된 S3 호환 오브젝트 스토리지를 같은 인터페이스로 사용한다.
  - DB에는 bucket/key/version/checksum/size/detected MIME을 저장한다.
  - presigned URL은 권한 확인 뒤 짧은 TTL로 발급한다.
  - 백업·복원 훈련에서 DB 메타데이터와 객체 체크섬을 대조한다.

#### WIKI-P0-004 댓글이 서버에 저장되지 않음

- 근거: `wikiApi.ts`가 댓글 API를 `wikiMock.ts`에서 그대로 export한다.
- 인수조건:
  - 페이지 댓글/답글 CRUD가 PostgreSQL에 영속되고 VIEW/COMMENT 권한을 검사한다.
  - 작성자만 수정·삭제할 수 있고 관리자는 감사 가능한 moderation을 수행한다.
  - backend 모드 새로고침·다른 브라우저에서도 동일 thread가 보인다.
  - 후속 인라인 댓글을 위해 `anchor_type`, `block_id`, range, 인용 스냅샷을 확장 가능하게 둔다.

#### WIKI-P0-005 실시간 공동 편집 런타임이 없음

- 인수조건:
  - CRDT 문서, WebSocket 인증, presence, 재접속, backpressure, 최대 문서 크기를 ADR로 확정한다.
  - 두 사용자의 삽입·삭제·서식 변경이 순서와 무관하게 수렴한다.
  - 일시 단절 후 재접속해도 승인된 편집이 유실되지 않는다.
  - collaboration 노드 종료·재기동 후 snapshot/update log로 문서를 복구한다.
  - 게시 버전과 공동 초안을 분리하고, 버전 생성 시점을 명시한다.

#### WIKI-P0-006 페이지 제한과 권한 상속이 없음

- 인수조건:
  - 사용자/그룹별 VIEW, COMMENT, EDIT, MANAGE 권한을 표현한다.
  - 부모 보기 제한은 자식에게 상속되고, 페이지 이동 시 권한 변화가 사전에 표시된다.
  - 비인가 페이지는 조회·검색·첨부·이벤트·알림 모든 경로에서 노출되지 않는다.
  - 마이그레이션에서 해석할 수 없는 제한은 공개하지 않고 fail-closed + 손실 보고한다.

#### WIKI-P0-007 마이그레이션 정규 모델과 실행 기반이 없음

- 인수조건:
  - 아래 중간 모델, 외부 ID 매핑, job/checkpoint, 손실 보고서 스키마를 먼저 확정한다.
  - 같은 입력을 두 번 실행해도 페이지·첨부·댓글이 중복되지 않는다.
  - 중단 후 마지막 성공 item부터 재개할 수 있다.
  - dry-run이 개수, 예상 용량, 미지원 매크로/블록, 미매핑 사용자·권한을 출력한다.

### P1 — P0 직후 운영 완성도

- `WIKI-P1-001`: 서버에 형제 순서와 재정렬 연산을 저장한다.
- `WIKI-P1-002`: 자동 저장, 저장 상태, retry, 공동 초안 보존을 완성한다.
- `WIKI-P1-003`: 휴지통, 복원, 보존 기간, 영구 삭제 권한을 구현한다.
- `WIKI-P1-004`: 인라인 댓글, 멘션, watch, 알림함, 읽음 상태를 구현한다.
- `WIKI-P1-005`: 라벨, 백링크, 최근 방문, 즐겨찾기를 서버 데이터로 전환한다.
- `WIKI-P1-006`: 사용자 이름·아바타·수정 시간을 모든 버전/댓글/검색 결과에서 일관되게 표시한다.
- `WIKI-P1-007`: 전역 검색 기능 브랜치를 main에 통합하고 페이지 제한 누출 테스트를 추가한다.
- `WIKI-P1-008`: 코드 언어 목록의 중복 `plaintext` key 경고를 제거한다.
- `WIKI-P1-009`: 약 1.44 MB인 초기 JS chunk를 route/editor 단위로 분할하고 성능 예산을 CI에 둔다.

### P2 — 제품 확장

- 페이지·스페이스 템플릿, 변경 요약, 소유자·검증 만료, 감사 조회 UI
- Markdown/HTML/PDF/전체 workspace export와 첨부 manifest
- 오프라인 우선 편집
- Notion형 데이터베이스 속성, 다중 view, relation/rollup/formula
- 미지원 Confluence 매크로의 플러그인 렌더러와 변환 규칙 카탈로그

## 6. 마이그레이션을 위한 목표 데이터 모델

Markdown은 계속 편집·내보내기 표현으로 사용할 수 있지만 유일한 정본으로 두지 않는다.

| 모델 | 필수 내용 |
|---|---|
| `document_ir` | 버전이 있는 block AST, stable block ID, marks, attrs, children, opaque node |
| `document_source` | provider, source instance, 원본 page/block/storage XHTML payload, checksum |
| `external_object_map` | provider/instance/object type/external ID → internal ID, source version, checksum |
| `media_object` | 원본명, detected MIME, size, checksum, bucket/key/version, 파생 자산 |
| `migration_job` | 범위, 상태, 옵션, 시작/종료, checkpoint, 집계, 요청자 |
| `migration_item` | 개별 object 상태, attempt, source/target ID, 오류 코드, 재시도 시각 |
| `migration_issue` | severity, page/block 위치, 미지원 기능, 대체 방식, 원문 보존 위치 |
| `principal_map` | 외부 사용자·그룹 → Keycloak/org principal, 미매핑 처리 |

변환 파이프라인은 `원본 보존 → 정규 IR → 우리 문서 projection → 검증/손실 보고` 순서로 한다.
지원하지 않는 Notion 블록이나 Confluence 매크로는 삭제하지 않고 `opaque` 노드로 원문과 위치를 보존한다.
첨부와 내부 링크는 모든 대상 ID가 만들어진 뒤 2차 pass에서 다시 연결한다.

### 공급자별 필수 처리

**Notion**

- 페이지와 block children pagination, archived/deleted 상태, rich text annotations
- database/data source property와 page relation의 별도 매핑
- 1시간 내 만료되는 업로드 파일 URL의 즉시 수집·재조회
- 링크·mention·synced block·unsupported block의 원본 보존
- API rate limit과 변경 중인 원본의 snapshot 기준

**Confluence Data Center**

- 지원 DC 버전별 REST/XML export 계약
- space key, content ID, ancestor, version, status, labels, comments, restrictions
- storage XHTML namespace와 macro parameter/body, resource identifier
- 첨부 버전, 본문 상대 참조, 사용자 key/username 변화
- 앱 제공 custom macro를 opaque node와 손실 보고서로 보존

공식 storage format은 [Confluence Storage Format](https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html),
Notion 파일 수집 제약은 [Notion API 파일 조회](https://developers.notion.com/guides/data-apis/retrieving-files),
내보내기 기준은 [Notion export](https://www.notion.com/help/export-your-content?slug=export-your-content)를 따른다.

## 7. 목표 구성요소

| 구성요소 | 책임 | 현재 기반 |
|---|---|---|
| `wiki-backend` | 페이지·버전·권한·댓글·media metadata | 확장 가능 |
| collaboration service | WebSocket, CRDT update, presence, snapshot | 없음 |
| PostgreSQL | 문서/버전/댓글/권한/마이그레이션 상태 | 준비됨 |
| Redis | presence TTL, fan-out, 임시 세션 조정 | Streams 기반 있음; 용도 분리 필요 |
| S3 호환 저장소 | 원본 첨부, 이미지, import 원본, export 결과 | S3 adapter·S3Mock·공유 metadata 준비; 운영 provider 미선정 |
| migration worker | Notion/DC 추출, 변환, 검증, 재시도 | 없음 |
| OpenSearch | 권한 필터가 적용된 페이지·첨부·댓글 검색 | 페이지·첨부 기반 있음 |
| Gateway/nginx | REST와 WebSocket 라우팅, 인증 전달 | REST 기반 있음; WS 설정 없음 |
| Loki/Grafana | 협업·업로드·마이그레이션 관측 | 로그 기반 있음; 전용 지표 필요 |

Confluence DC가 다중 application node, load balancer, 공유 DB와 공유 첨부 저장소를 전제로 하듯이,
우리도 로컬 디스크를 운영 저장소로 간주하지 않는다.

## 8. 단계별 구현 순서와 완료 기준

### W14 — 문서·마이그레이션 기반 결정

- collaboration 방식(Yjs/Hocuspocus 계열 또는 동등 구현), IR, media, 권한 상속 ADR
- `document_ir` schema versioning과 Markdown round-trip fixture
- Notion/Confluence 대표 fixture와 손실 등급 정의
- 완료: 지원 블록/매크로 표와 golden conversion test가 CI에서 통과
- 진행 문서: [W14 콘텐츠·공동편집·마이그레이션 아키텍처 결정 제안](../backend/2026-08-16-w14-content-collaboration-architecture.md)
- 현재 상태: 제안 ADR, Document IR v1 JSON Schema, Notion/Confluence golden fixture와 의미 계약 테스트 완료.
  실제 converter, Tiptap 2 호환 collaboration spike, 블록·매크로 지원표는 잔여 작업이다.

### W15 — 이미지·첨부 운영화 (진행 중)

- storage interface, S3Mock 개발 구성, S3 호환 운영 설정
- drag/drop/paste 업로드, inline delivery, checksum, MIME 탐지, 고아 정리
- 완료: 두 backend node 중 어느 노드로 요청해도 같은 이미지가 보이고 재배포 후에도 유지
- 1차 완료: local/S3 routing, bucket/key/version/SHA-256, magic-byte MIME, 권한 기반 raster inline,
  transaction rollback/after-commit 정리, S3Mock 5.1.0 compose·정적 smoke·versioned put/get/delete 통합 검증.
- 2차 완료: 파일 선택/drag/drop/paste 공통 업로드, host 없는 attachment ID 저장, 메모리 AT 기반
  인증 이미지 fetch, Blob URL 수명 정리, unsafe MIME 즉시 삭제, 저장 전 제거·취소 업로드 정리.
- 3차 완료: XHR 바이트 진행률·취소·401 refresh 재전송, 실패/취소 인라인 재시도 UI, 복수 파일 병렬 전송과
  선택 순서 삽입, PENDING→CONFIRMED 수명주기, 본문 검증 confirm API, 만료 pending reconciliation job.
- 4차 완료: Compose scale 제약 제거, wiki docker Eureka 등록과 gateway `lb://` 라우팅, 실제 2개 노드
  healthy/Eureka UP 스모크, 독립 S3 client 간 versioned object 읽기·삭제 통합 검증.
- 다음 증분: 인증 포함 노드 교차 REST 스모크, storage inventory reconciliation, AV/decoder·썸네일/EXIF 처리,
  운영 후보 object storage 통합 테스트와 provider·IAM·백업/복원 결정.

### W16 — 편집 정확성·서버 협업 데이터

- 실제 stale version 처리, 서버 형제 순서, 댓글/답글 API, 사용자 표시정보
- 완료: 두 브라우저 stale 저장, 댓글 재접속, 동시 재정렬 테스트 통과
- 1차 완료: load-time expectedVersion 전달, typed conflict와 최신 서버본 재조회, 로컬 편집 보존,
  서버/로컬 비교·복사·서버본 재로드·명시적 수동 병합 UI, 두 세션 stale 저장 회귀 테스트.

### W17 — 실시간 공동 편집

- collaboration service, WebSocket 프록시, CRDT, presence, shared draft, snapshot/recovery
- 1차 완료: Tiptap 2.27.2 + Yjs 13 호환 버전·MIT 라이선스 고정, 기존 위키 스키마 공유,
  중복 history 제거, 격리된 두 편집자의 동시 삽입 CRDT 수렴 테스트.
- 2차 완료: 별도 Node collaboration service, Redis `GETDEL` ticket 인증, PostgreSQL binary snapshot,
  nginx→gateway WebSocket 프록시, 프론트 재연결별 새 ticket·presence·연결 복구 UX. 18서비스 live smoke와
  same-ticket 재사용 거부·Yjs state 저장을 실연결로 검증.
- 다음 증분: 원자적 최초 문서 bootstrap, Tiptap Y.Doc 실제 결합·공동 커서, shared draft publish/version
  generation 계약, 2인 브라우저 동시 서식·표 편집 및 네트워크 단절/노드 재기동 장애 복구 스모크.
- 완료: 2인 동시 편집·네트워크 단절·노드 재기동 테스트에서 내용이 수렴하고 승인된 편집이 유실되지 않음

### W18 — 권한·거버넌스

- 페이지 제한/상속, 휴지통, 라벨, 백링크, watch, 알림, 감사 이벤트
- 완료: 페이지 이동/검색/첨부/알림을 포함한 권한 누출 테스트와 삭제 복원 테스트 통과

### W19 — Notion·Confluence DC 가져오기

- connector, worker, dry-run, checkpoint, retry/DLQ, principal mapping, loss report
- 완료: 대표 fixture 재실행이 멱등이고 페이지 수·첨부 checksum·링크·권한 검증 보고서가 일치

### W20 — 확장 기능

- export, 템플릿, 검증 페이지, 오프라인, Notion database 트랙
- 완료: 기능별 별도 PRD와 호환성 표를 충족

## 9. 비기능 인수조건

- **데이터 무결성:** 정상 응답한 저장·업로드·CRDT update는 프로세스 종료 후에도 복구된다.
- **권한:** 본문, 제목, 검색 snippet, 첨부, 이벤트, 알림 어디에서도 비인가 데이터가 새지 않는다.
- **보안:** MIME sniffing, 파일 크기 제한, 악성 파일 검사, SVG/HTML inline 정책, signed URL TTL을 명시한다.
- **복구:** PostgreSQL과 객체 저장소의 RPO/RTO를 정하고 정기 restore drill 결과를 남긴다.
- **관측:** 활성 collaboration session, WS 연결 실패, update 지연, upload 실패, migration 처리율·DLQ를 계측한다.
- **성능:** 동시 사용자/문서 크기/첨부 크기 목표를 부하 테스트 프로파일로 고정하고 회귀를 CI 또는 정기 잡에서 탐지한다.
- **호환성:** IR schema와 import connector는 버전이 있고, 이전 버전 fixture를 계속 읽을 수 있다.

## 10. 구현 전 결정 게이트

아래 네 가지는 W14에서 결정하지 않으면 후속 구현이 서로 충돌한다.

1. collaboration 런타임을 완전 self-host할지, 상용 Tiptap collaboration on-prem을 검토할지
2. S3Mock은 개발 전용으로 두고 운영은 어떤 S3 호환 저장소·IAM·백업 체계를 사용할지
3. 마이그레이션을 일회성 import로 제한할지, 검증 기간 중 증분 재동기화까지 지원할지
4. 지원할 Confluence DC 최소/최대 버전과 custom macro의 허용 손실 수준

## 11. 현재 검증 기준선

- `wiki-front`: 77개 테스트 파일, 593개 테스트 통과, production build 통과
- `wiki-backend`: 60개 테스트 통과
- 확인된 품질 부채: 중복 `plaintext` React key 경고, 약 1.44 MB 초기 JS chunk 경고
- 검증 브랜치: `wiki-front/feat/wiki-global-search`, `wiki-backend/main`

이 수치는 기능 수가 아니라 회귀 기준선이다. 특히 공동 편집·객체 저장소·마이그레이션은 현재 테스트 수에
포함되지 않으므로, 기존 테스트가 모두 통과해도 Notion·Confluence 동등성을 의미하지 않는다.
