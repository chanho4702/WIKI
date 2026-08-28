# W18 페이지 제한(권한 체계) 상세 설계 (2026-08-23)

> 상위 근거: ADR-W14-06(`docs/backend/2026-08-16-w14-content-collaboration-architecture.md` —
> "page restriction은 space 권한보다 더 허용적일 수 없다"), 갭 분석 §5.5(계정·권한 실측).
> 이 문서는 그 의미론을 **구현 가능한 데이터 모델·판정 함수·API·UI·테스트 계획**으로 구체화한다.
> 설계 문서다 — 코드 착수 시 이 문서가 스펙이다.

## 0. 역할 분담 (실측 — 다시 만들지 않는다)

- **org-service(소유): 주체와 공간 권한.** 사용자(member)·팀(team/team_member)·grant_entry
  (USER/TEAM × SPACE × VIEWER/EDITOR/ADMIN)와 gRPC 판정. 여기는 손대지 않되 §3.3의
  팀 멤버십 조회 1개를 추가한다.
- **wiki-backend(소유): 페이지 제한.** 콘텐츠 계층(부모 체인)에 강결합이므로 wiki가 갖는다.
- 판정 순서는 항상 **space 권한 먼저(없으면 즉시 거부) → 페이지 제한으로 좁히기만**.

## 1. 범위

**포함(Must)** — ① `page_restriction` 모델(V11) ② effective permission 단일 함수와 전 지점
적용(본문·트리·첨부·댓글·검색·협업 티켓) ③ 제한 관리 API+UI(자물쇠 다이얼로그)
④ 이동 시 접근 상실 경고(ADR 마지막 단락) ⑤ 권한 누출 테스트 매트릭스.
**제외(Won't now)** — COMMENT/RESTRICT 세분 action(org 확장, Should), 감사 이벤트,
멤버 관리 UI 위치 결정(열린 결정 유지), 게스트 계정.

## 2. 데이터 모델 — V11 `page_restriction`

```sql
CREATE TABLE page_restriction (
    id             BIGSERIAL PRIMARY KEY,
    page_id        BIGINT NOT NULL REFERENCES page(id) ON DELETE CASCADE,
    type           VARCHAR(8)  NOT NULL,  -- VIEW | EDIT
    principal_type VARCHAR(8)  NOT NULL,  -- USER | TEAM
    principal_id   BIGINT NOT NULL,       -- org-service member.id 또는 team.id (원장은 org)
    created_by     BIGINT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_page_restriction UNIQUE (page_id, type, principal_type, principal_id)
);
CREATE INDEX idx_page_restriction_page ON page_restriction (page_id);
```

- **행이 없으면 "제한 없음"** — (page, type)에 행이 하나라도 있으면 그 목록에 든 주체만 통과.
  Confluence와 같은 해석이라 UI 문구도 그대로 옮길 수 있다("모든 사용자가 볼 수 있습니다").
- principal 실재 검증은 쓰기 시점에 org-service로 1회 확인(삭제된 주체 행은 판정에서 무시 —
  fail-closed 방향이라 안전).

## 3. Effective permission — 단일 함수

### 3.1 판정 알고리즘 (`EffectivePermissionService.can(userId, pageId, action)`)

```
1. page = 로드, chain = 루트→page 조상 체인          (스페이스 스코프 1쿼리 + 메모리, §8)
2. space 권한 확인(org gRPC, 30s 캐시):
     action=VIEW → VIEW 필요 / EDIT → EDIT / ADMIN → ADMIN. 없으면 즉시 거부 (ADR 규칙 3)
3. VIEW 제한 (ADR 규칙 4 — 조상 상속·교집합):
     chain의 각 노드 n에 대해: n에 VIEW 제한 행이 있으면
       user 또는 user의 팀이 그 목록에 있어야 한다. 하나라도 실패 → 거부.
4. action=EDIT이면 (ADR 규칙 5 — 현재 페이지만, VIEW를 암시하지 않음):
     page 자신의 EDIT 제한 행이 있으면 위와 같은 포함 검사. 조상의 EDIT 제한은 보지 않는다.
5. 통과 → 허용.
```

- **space ADMIN**(ADR 규칙 6): 제한 **관리**(조회·수정·해제)는 제한 목록에 없어도 허용하되,
  본문 읽기·검색 스니펫은 3~4를 그대로 탄다. 관리 화면·오류 메시지에 본문을 싣지 않는다.
  (실무 탈출구: ADMIN이 제한을 해제하거나 자신을 목록에 추가하면 된다 — 별도 우회 없음.)
- 폴더도 Page다 — 제한은 타입 무관 동일 적용(폴더 VIEW 제한 = 하위 전체 차단).

### 3.2 적용 지점 (전부 이 함수 하나로 — ADR "같은 함수" 요구)

| 지점 | 적용 |
|---|---|
| `GET /pages/{id}` 본문·리비전·조회수 기록 | can(VIEW) |
| 트리 API | space 페이지 일괄 판정(§8) — 비인가 노드는 **자손 포함 제외**(VIEW 상속이라 자연스럽다) |
| 수정·이동·복제·삭제·아이콘 | can(EDIT) (+이동은 §5 영향 확인) |
| 첨부 다운로드/인라인 | 소유 페이지 can(VIEW) |
| 댓글 목록/작성 | can(VIEW) (COMMENT 분리는 Won't now) |
| 협업 티켓 발급 | can(EDIT) |
| 검색 | §4 |
| 알림(W18 후속) | 발송 전 수신자별 can(VIEW) 필터 |

### 3.3 팀 멤버십

판정 3~4의 "user의 팀"은 org-service가 원장이다. gRPC에 `ListTeamsOf(userId) → team_id[]`를
추가하고 wiki-backend가 **권한 판정과 같은 TTL(30초) Caffeine 캐시**로 감싼다. 제한 변경·팀
탈퇴의 전파 지연은 기존 권한 캐시와 같은 트레이드오프로 문서화한다.

## 4. 검색 누출 차단 (P1-007 잔여)

색인(search-service)은 제한을 모른다 — 알게 하면 제한 변경마다 재색인이 필요해 일관성이
어렵다. **질의 시점 후필터**를 쓴다:

1. search-service는 지금처럼 space 스코프로 검색한다(space 권한은 질의 조건).
2. wiki-backend에 `POST /api/wiki/pages/visible {pageIds:[...]} → {visible:[...]}` 배치 판정
   API를 추가하고, 게이트웨이 검색 리졸버가 결과 페이지 id를 후필터한다(스니펫 포함 결과에서
   비인가 행 제거 — 개수 보정은 "N건 이상" 표기 허용).
3. 색인에는 `restricted: boolean`만 넣는다 — 제한 없는 문서(대다수)는 후필터 호출을 건너뛰는
   최적화 힌트. M 규모(스페이스당 수천 페이지, 검색 페이지 20건)에서 배치 1회면 충분하다.

## 5. 이동 영향 확인 (ADR 마지막 단락)

`POST /pages/{id}/move`에 2단계 계약을 추가한다:

- 1차 호출(기본): 서버가 이전/새 조상 체인의 VIEW 제한 노드 차이를 계산. 새로 적용되는 제한이
  있으면 `409 {"error":"...", "impact":{"newlyRestrictedBy":[{pageId,pageTitle,principals}...]}}`로
  응답한다. TEAM 중첩과 space grant 전체를 펼친 정확한 `losers` 계산은 비용과 오판 가능성이 있어,
  UI는 "접근 범위가 좁아질 수 있음"으로 보수적으로 안내한다(구현 조정 2026-08-28).
- 프론트는 영향 다이얼로그(새로 적용되는 제한 출처 목록)를 보여주고, 확인 시 `"confirmImpact":true`를
  실어 재호출 → 실행. 영향 없으면 1차 호출이 곧바로 실행된다(현행 무변경 경로).

## 6. API 계약 (프론트 `docs/backend` 계약 문서에 반영할 것)

| 함수 | 메서드/경로 | 비고 |
|---|---|---|
| getRestrictions(pageId) | GET /api/wiki/pages/{id}/restrictions | `{view:[Principal], edit:[Principal], inherited:[{pageId,title,principals}]}` — inherited는 조상 VIEW 제한(읽기 전용 표시) |
| setRestrictions(pageId, {view, edit}) | PUT /api/wiki/pages/{id}/restrictions | 전체 교체(부분 패치 없음 — 다이얼로그가 전체 상태를 안다). can(EDIT)+제한 통과자 또는 space ADMIN |
| (배치) visible | POST /api/wiki/pages/visible | §4 — 게이트웨이 내부용 |

Principal = `{type:"USER"|"TEAM", id, name}` (name은 응답 시 org 디렉터리로 해석해 채운다).
403 메시지 규약: 존재 자체를 숨길 필요까지는 없다(M 규모 사내 위키) — 404가 아니라
`"이 페이지를 볼 권한이 없습니다"` 403. **단, 제목·본문은 싣지 않는다.**

## 7. UI (컨플루언스 참조 — 자물쇠 다이얼로그)

- 페이지 보기/편집 헤더에 자물쇠 아이콘(제한 있으면 채워진 자물쇠 + 색). 클릭 → 다이얼로그:
  - 라디오: "제한 없음" / "보기 제한" / "편집만 제한" + 주체 검색(org 디렉터리 자동완성,
    사용자·팀) 목록 추가/제거.
  - 조상에서 상속된 보기 제한은 회색 읽기 전용 행으로 표기("상위 '운영 문서'에서 상속됨").
- 트리·검색에서는 비인가 문서가 그냥 안 보인다(별도 잠금 표시 없음 — 존재 노출 최소화).
- 이동 다이얼로그는 §5의 영향 응답을 받으면 잃는 사용자 목록 확인 단계를 끼워 넣는다.

## 8. 규모 고려 (tree-scale-review 2026-08-23와 정합)

- 판정 입력은 **스페이스 스코프 일괄 로드** 2쿼리: ①`(id,parent_id)` ②해당 스페이스 페이지의
  제한 행 전체(`page_restriction join page on space_id`). 트리 필터·단건 판정·이동 영향 계산이
  같은 로드를 공유한다. 제한 행은 예외적 소수라는 전제(컨플 실사용과 동일)라 메모리 부담 없음.
- 캐시: (spaceId → 제한 행 스냅샷) Caffeine 30초 + 제한 쓰기 시 무효화. org 판정 캐시와 같은
  지연 특성으로 맞춘다.
- 협업 세션은 티켓 발급 시점 판정이다 — 세션 중 제한 강화는 다음 티켓 갱신에서 반영(문서화).

## 9. 테스트 계획 — 권한 누출 매트릭스 (W18 완료 기준)

행 = 접근 경로(본문 GET/트리/검색/첨부/댓글/협업 티켓/이동/알림), 열 = 시나리오:

1. space 권한 없음(제한 무관 거부 — ADR 규칙 3)
2. 조상 VIEW 제한에 미포함(자손 접근 거부 — 규칙 4)
3. 페이지 EDIT 제한 미포함(보기는 되고 수정만 거부 — 규칙 5)
4. TEAM 경유 통과(팀 멤버십 판정)
5. space ADMIN — 제한 관리는 가능, 본문은 거부(규칙 6)
6. 이동으로 제한 조상 아래 들어갈 때 영향 경고(§5)

MockMvc + FakePermissionClient(+FakeTeamDirectory) 페이크로 org 의존 없이 돌린다.
검색 후필터는 게이트웨이 리졸버 단위 테스트 + wiki visible API 계약 테스트로 나눈다.

## 10. 구현 순서 (증분) — **전부 구현 완료(2026-08-24)**

구현 결과와 설계 대비 조정 사항:
- 마이그레이션 번호는 **V12**(V11은 알림이 선점).
- principal 이름 해석은 프론트(org 디렉터리 REST) — wiki→org REST 신규 결합 회피(§6 조정).
- 검색 후필터는 REST visible API 대신 **wiki gRPC `FilterVisiblePages`(proto 0.8.0)** —
  search-service가 이미 wiki gRPC 채널을 갖고 있어 인증 배관이 불필요(§4 조정).
  `restricted` 색인 힌트는 생략(이벤트·스키마 변경 회피, M 규모에서 배치 1회 비용 수용).
- 스페이스 제한 Caffeine 캐시는 미도입 — 관리 API 쓰기 무효화와 함께 넣기로 했으나
  요청당 2쿼리(스페이스 스코프)가 충분히 싸서 실측 병목 확인 후로 미룸(§8 조정).
- 셀프 락아웃 가드 추가(설계엔 없던 보호): 비ADMIN이 자신이 빠진 VIEW 제한을 걸면 400.
- TeamDirectory 기본 구현은 fail-closed 빈 목록, 운영은 org gRPC `ListUserTeams`(proto 0.7.0)
  + 30초 캐시.
- 제한 주체 저장 전 org gRPC `ValidatePrincipals`(proto 0.9.0)로 USER/TEAM 실재 여부를 일괄
  검증한다. org-service 장애나 미배포(`UNIMPLEMENTED`) 시에는 저장을 503으로 차단한다.


1. V11 + 엔티티/리포지토리 + `EffectivePermissionService`(단건·배치) + 본문/트리/첨부/댓글/티켓 적용 + 누출 테스트 1~5
2. 제한 관리 API + org 팀 멤버십 gRPC + 프론트 자물쇠 다이얼로그(듀얼모드 목업 포함)
3. 이동 영향 2단계 계약 + 프론트 확인 다이얼로그 + 누출 테스트 6
4. 검색 후필터(게이트웨이 리졸버 + visible API) — P1-007 잔여 해소

## 11. 열린 정책 결정 (구현 전 확인 불필요, 바뀌면 문서 갱신)

- ❓ 403 vs 404(존재 은닉) — 본 설계는 403(사내 M 규모 전제). 외부 공개 시 재검토.
- ❓ COMMENT action 분리 — org 확장 필요, Should로 유지.
- ❓ 제한 변경 감사 이벤트 — Should. 도입 시 grant 감사와 같은 채널(Redis Streams).
