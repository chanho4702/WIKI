# 공개 문서 인스턴스(docs) 설계 — 로그인 없는 읽기 전용 위키

작성 2026-09-04. 사용자 결정: 엔지니어링 노트를 위키로 옮기되 **별도 DB의 전용 인스턴스처럼, 웹에서는 아무도 편집 못 하게**(옵션 1: 동기화 스크립트로만 주입).

## 1. 목표 / 비목표

**목표**
- 옵시디언 "MSA_TEMPLATE 정리" 노트(00~32, 34편)를 `http://<host>/docs/` 에서 **로그인 없이** 읽을 수 있게 한다.
- 기존 `/wiki/`(팀 위키)와 **DB·프로세스가 분리**된 두 번째 wiki-backend 인스턴스가 서빙한다. 팀 위키 데이터·권한은 전혀 건드리지 않는다.
- 웹 UI와 공개 API에서 **모든 쓰기를 차단**한다. 문서는 로컬에서 도는 임포터만 넣는다.
- myFront의 `/tech/notes`는 `/docs/`로 **이동**한다(노트 사본을 myFront에 두지 않는다).

**비목표**
- 관리자 로그인 편집(옵션 2) — 하지 않는다.
- 스페이스 단위 "공개" 플래그를 팀 위키에 추가하는 것 — 하지 않는다(DB 분리 요구와 어긋남).
- 사람이 읽는 슬러그 URL — 1차에서는 위키의 숫자 ID URL(`/docs/spaces/{id}/pages/{id}`)을 그대로 쓴다. 임포터가 노트 번호 → 페이지 ID 매핑을 유지하므로 재실행해도 URL이 바뀌지 않는다.
- 게이트웨이 변경 — 하지 않는다. `/api/docs/`는 nginx가 docs 백엔드로 직접 프록시한다(게이트웨이의 제로트러스트 허용 목록을 건드리지 않기 위해).

## 2. 구성 요소

```
브라우저 ── nginx(:80)
             ├─ /docs/            → /srv/apps/docs (wiki-front 읽기 전용 빌드, base=/docs/)
             ├─ /api/docs/search/ → docs-backend:9110/           (lite 검색 GraphQL)
             ├─ /api/docs/        → docs-backend:9110/api/wiki/   (X-Docs-Import-Token 헤더 제거)
             ├─ /wiki/, /alm/, /api/ … (기존 그대로, 게이트웨이 경유)
docs-backend(platform-docs-backend) ── postgres/docsdb   (SPRING_PROFILES_ACTIVE=docker,docs)
             └─ 127.0.0.1:19110 (호스트 루프백에만 공개 — 임포터 전용)
임포터(myFront/scripts/sync-docs.mjs, 로컬 실행) ── 옵시디언 볼트 → http://127.0.0.1:19110 (+ 임포트 토큰)
```

### 2.1 wiki-backend `docs` 프로필 (코드 변경은 프로필 전용 클래스 추가만)

`application-docs.yml`
- `platform.jwt.issuer/audience` **미설정** → common-starter의 JwtDecoder 자동설정이 꺼진다(`@ConditionalOnProperty`).
- 끔: `eureka.client.enabled=false`, `platform.grpc.enabled=false`, `platform.events.enabled=false`, 스케줄러 5종(`trash`·`revisions`·`attachment-reconciliation`·`mail.digest`·`migration-worker`)=false, 메일 호스트 비움.
- 켬: Flyway(신규 DB에 스키마 자동 생성), Redis(`CollaborationTicketService`가 무조건 `StringRedisTemplate`을 요구 — 플랫폼 redis를 그대로 가리킴), 첨부는 local 백엔드(노트에 이미지 없음).
- `platform.docs.import-token` (env `DOCS_IMPORT_TOKEN`) — 비어 있으면 임포트 경로도 닫힌다.

`config/DocsSecurityConfig.java` (`@Profile("docs")`), 기존 `SecurityConfig.filterChain`은 `@Profile("!docs")`
- 필터 체인: `OPTIONS` 허용 / `GET /api/wiki/**` 허용 / `POST /graphql` 허용 / **임포트 토큰이 맞는 요청**은 `/api/wiki/**` 전체 허용 / 나머지 `denyAll`(403).
- `DocsPrincipalFilter`(OncePerRequestFilter): 모든 요청에 합성 JWT 주체를 심는다 — 익명은 `sub=0, name="docs"`, 임포트 토큰 요청은 `sub=1, name="importer"`. 컨트롤러가 `jwt.getSubject()`를 파싱하므로 주체 없이는 NPE가 나기 때문. `sub=0`은 org-service에 존재하지 않는 사용자 ID라 실수로 권한이 생길 수 없다.
- `POST /api/wiki/pages/{id}/views`(조회수)는 **차단**한다 — 공개 인스턴스는 조회수를 세지 않는다. 프론트가 읽기 전용 모드에서 호출하지 않는다.
- 권한 빈(전부 `@ConditionalOnMissingBean`이라 프로필 빈이 우선): `PublicReadPermissionClient` — `VIEW`는 항상 true, `accessibleSpaces`=`AccessScope(all=true)`, 임포터 주체(sub=1)에게는 `EDIT/ADMIN`도 true, 그 외 false. `TeamDirectory`=빈 목록, `PrincipalDirectory`=항상 실재.
- 초안(DRAFT) 필터는 두지 않는다 — 쓰기가 막혀 있고 임포터는 `published`로만 만들므로 DB에 초안이 생길 수 없다(구조로 보장).

테스트(`src/test/.../docs/DocsSecurityTest`): `@ActiveProfiles({"test","docs"})` MockMvc — 익명 GET 200, 익명 POST/PUT/DELETE 403, 조회수 POST 403, 잘못된 토큰 403, 올바른 토큰 POST 통과, `/graphql` POST 통과.

### 2.2 wiki-front 읽기 전용 모드

빌드 변수(`.env.docs`, CI에서 `--mode docs`):
- `VITE_BASE=/docs/` → `vite.config.ts` `base: env.VITE_BASE ?? "/wiki/"`, `main.tsx` basename은 `import.meta.env.BASE_URL`에서 파생(짝 유지 불변조건을 코드로 고정).
- `VITE_WIKI_READONLY=true` → `lib/readOnly.tsx`의 `READ_ONLY` 상수 + `ReadOnlyProvider`/`useReadOnly()`(테스트는 provider로 주입).
- `VITE_WIKI_API_PREFIX=/api/docs`, `VITE_SEARCH_API_PREFIX=/api/docs/search` → **apiClient 한 곳**에서 경로를 치환한다(`/api/wiki/…`→prefix, `/api/search/graphql`→prefix). 첨부 URL 생성 2곳도 같은 상수를 쓴다. 기본값은 기존 경로라 팀 위키 빌드는 무변경.

읽기 전용일 때:
- `AuthGate enabled=false` — 로그인 리다이렉트 없음. 사용자 메뉴·알림 벨·`/api/me`·검색 색인 상태 프로브·별표 서버 동기화·조회수 기록을 호출하지 않는다.
- 라우트에서 제외: `pages/new`, `pages/:id/edit`, `settings/*`, `trash`, `archive`, `admin/*`, `tasks`, `notifications`. 접근 시 스페이스 홈으로 리다이렉트. 에디터 청크는 lazy라 번들에서 빠진다.
- 숨김: 만들기 드롭다운·트리 `+`/드래그/행 메뉴·편집·제한·별표·구독·공유·"…"(내보내기만 남김)·리액션·라벨 편집·첨부 업로드/삭제·댓글/인라인 댓글 작성·블로그 글쓰기·폴더 생성/이름 변경·내 스페이스·첫 스페이스 만들기. 체크박스는 `onTaskToggle` 생략으로 비활성.
- 상단바에 "읽기 전용 문서" 배지(DS `Badge`) 표시. `me`가 null이면 아바타 자체가 안 뜬다(기존 동작).
- 스페이스 목록 로드 실패는 기존처럼 에러 상태로 노출(빈 목록으로 삼키지 않음).

테스트: `App.w28-readonly.test.tsx` — 만들기/편집/댓글 폼 부재, 편집 라우트 리다이렉트, `AuthGate enabled=false`면 redirect 미호출. 기존 테스트는 provider 기본값(false)이라 무변경.

CI(`wiki-front/.github/workflows/ci.yml`): `pnpm build`(dist) + `pnpm build --mode docs --outDir dist-docs` → 아티팩트 `dist`, `dist-docs` 업로드, main 이면 `deploy` dispatch를 `wiki`와 `docs` 두 번.

### 2.3 운영(infra-settings)

`infra/keycloak/docker-compose.yml`
- `docs-db-init`(postgres 이미지, 1회 실행): `SELECT 'CREATE DATABASE docsdb' WHERE NOT EXISTS(...) \gexec` — 기존 볼륨에서도 멱등. `init-authdb.sql`에도 `docsdb` 추가(새 볼륨용).
- `docs-backend`: 같은 `ghcr.io/chanho4702/wiki-backend` 이미지, `container_name: platform-docs-backend`, `SPRING_PROFILES_ACTIVE=docker,docs`, `WIKI_DB_URL=…/docsdb`, `WIKI_EUREKA_ENABLED=false`, `DOCS_IMPORT_TOKEN=${DOCS_IMPORT_TOKEN}`, `WIKI_PUBLIC_URL=http://localhost/docs`, ports `127.0.0.1:19110:9110`, depends_on postgres·redis·docs-db-init.
- nginx: `C:/deploy/dist/docs:/srv/apps/docs:ro` 마운트, `default.conf`에 `= /docs` 301, `location /docs/`, `location ^~ /api/docs/search/`, `location ^~ /api/docs/`(`proxy_set_header X-Docs-Import-Token ""`). `^~`라 기존 `/api/` 정규식보다 우선.
- `.env.example`에 `DOCS_IMPORT_TOKEN` 추가.

`.github/workflows/deploy.yml`: 허용 목록에 `docs`, `docs-backend`; `$dirMap['docs']='docs'`, 아티팩트 이름 맵(`docs`→`dist-docs`); 백엔드 맵에 `docs-backend`(scale 1).

### 2.4 임포터 `myFront/scripts/sync-docs.mjs` (기존 `sync-notes.mjs`를 대체)

- 입력: 볼트 `msa/MSA_TEMPLATE 정리`의 `NN 제목.md`(기존 `transform.mjs` 재사용 — 프론트매터·H1 승격·콜아웃; 위키링크 변환의 목적지만 위키 페이지 URL로).
- 대상: `http://127.0.0.1:19110` (env `DOCS_API`), 헤더 `X-Docs-Import-Token`(env `DOCS_IMPORT_TOKEN`, 컴포즈 `.env`와 같은 값).
- 절차(멱등):
  1. `GET /api/wiki/spaces`에서 key `docs`를 찾고 없으면 `POST /api/wiki/spaces {key:"docs", name:"MSA_TEMPLATE 정리"}`.
  2. 매핑 파일 `myFront/scripts/docs-pages.json`(`{ "00": pageId, … }`, 커밋)으로 노트→페이지를 고정. 매핑에 없으면 `POST /api/wiki/pages`(published, 루트) 후 기록.
  3. 1차: 전 노트 생성/확인 → 2차: 위키링크를 `/docs/spaces/{sid}/pages/{pid}`로 풀어 `PUT /api/wiki/pages/{id}`(`expectedVersion`은 직전 GET 값, 내용 동일하면 건너뜀).
  4. 30번 중복 같은 ID 충돌은 실패로 보고한다(기존 가드 유지) — 사용자가 볼트에서 정리해야 한다.
- 실행: `npm run sync:docs`. CI에서는 돌지 않는다(볼트·토큰이 없음).

### 2.5 myFront 이동

- `/tech/notes`, `/tech/notes/:id` → `/docs/`로 리다이렉트(외부 이동이라 `window.location`). 헤더·푸터 "노트" 링크 `href="/docs/"`. `/tech`의 노트 섹션은 "엔지니어링 노트 → /docs/" 카드 하나로.
- `src/site/content/notes/*`, `notes.ts`, `NotesIndexPage`/`NoteDetailPage`/`NoteBody`, `sync-notes.mjs`, `sync:notes` 스크립트 삭제. `transform.mjs`(+테스트)는 임포터가 쓰므로 유지.

## 3. 실행 순서와 게이트

1. 백엔드(docs 프로필 + 테스트) — `gradlew test` 그린.
2. 프론트(읽기 전용 모드 + 테스트 + CI 이중 빌드) — `pnpm typecheck && pnpm test && pnpm build --mode docs` 그린.
3. 운영(컴포즈·nginx·deploy.yml) — 로컬에서 `docker compose up -d docs-db-init docs-backend`, nginx 재시작, `curl /api/docs/spaces` 200(익명)·`POST` 403 확인.
4. 임포터 실행 → `/docs/`에서 34편 열람 확인(라이트/다크).
5. myFront 이동 커밋.
6. 리뷰(code-review 스킬, 경계면 5개 체크). 페이블 세션이라 Codex 교차검증은 생략.

## 4. 열린 결정 (사용자 확인 필요, 기본값으로 진행)

- URL은 `/docs/`(같은 오리진). 서브도메인(`docs.<host>`)은 온프렘 배포 때 nginx server 블록 하나로 바꿀 수 있다.
- 임포터 채널은 "루프백 포트 + 서버 비밀 토큰"이다. 토큰 없이 DB 직접 적재(pg)로 바꾸면 도메인 규칙(리비전·트리)을 우회하게 되어 택하지 않았다.
- myFront의 노트 사본은 **삭제**한다(이동). 남겨 두길 원하면 2.5만 빼면 된다.
