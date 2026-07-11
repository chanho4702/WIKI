import type { Comment, Page, PageVersion, Space, WikiData } from "../features/wiki/store/types";
import { MOCK_USERS } from "./users";

const T_CREATE = "2026-07-10T09:00:00.000Z";
const T_UPDATE = "2026-07-10T10:00:00.000Z"; // pg1 v2 저장 시각
const T_COMMENT_1 = "2026-07-10T11:00:00.000Z";
const T_COMMENT_2 = "2026-07-10T11:30:00.000Z";

/** pg1 v1의 본문 (수정 전 — 버전 이력 확인용) */
const PG1_BODY_V1 = ["# 개발 위키", "", "초기 안내 문서입니다."].join("\n");

/** pg1 현재 본문 = v2 — 마크다운 렌더링 예시(제목/목록/코드블록/표)를 겸한다 */
const PG1_BODY = [
  "# 개발 위키에 오신 것을 환영합니다",
  "",
  "이 문서는 마크다운 렌더링 예시를 겸합니다.",
  "",
  "## 시작 순서",
  "",
  "1. 저장소를 클론한다",
  "2. `pnpm install`을 실행한다",
  "3. `pnpm dev`로 개발 서버를 띄운다",
  "",
  "## 주요 명령어",
  "",
  "| 명령어 | 설명 |",
  "| --- | --- |",
  "| `pnpm typecheck` | 타입 검사 |",
  "| `pnpm test` | 테스트 실행 |",
  "| `pnpm build` | 프로덕션 빌드 |",
  "",
  "## 예시 코드",
  "",
  "```ts",
  "export function greet(name: string): string {",
  "  return `안녕하세요, ${name}님!`;",
  "}",
  "```",
  "",
  "- 문서는 스페이스 단위로 관리한다",
  "- 페이지는 트리 구조로 정리한다",
].join("\n");

const PG2_BODY = ["## 회의", "", "- 데일리는 10시에 시작한다", "", "## 리뷰", "", "- PR은 24시간 안에 리뷰한다"].join("\n");
const PG3_BODY = ["## 필수 도구", "", "- Node.js 22", "- pnpm 10", "- Docker Desktop"].join("\n");
const PG4_BODY = ["## 배포 절차", "", "1. main 브랜치 태그 생성", "2. CI 파이프라인 확인"].join("\n");
const PG5_BODY = ["## MySQL 컨테이너", "", "`docker compose up -d mysql`로 띄운다."].join("\n");

export function createSeedData(): WikiData {
  const space: Space = { id: "sp1", key: "DEV", name: "개발 위키", createdAt: T_CREATE };

  const base = { spaceId: "sp1", createdAt: T_CREATE };

  const pages: Page[] = [
    // 루트 2개 — pg1은 수정 이력(v2)이 있어 updatedBy/updatedAt이 다르다
    { ...base, id: "pg1", parentId: null, title: "시작하기", body: PG1_BODY, position: 1, createdBy: "u1", updatedBy: "u2", updatedAt: T_UPDATE },
    { ...base, id: "pg2", parentId: null, title: "팀 규칙", body: PG2_BODY, position: 2, createdBy: "u1", updatedBy: "u1", updatedAt: T_CREATE },
    // pg1의 하위 2개
    { ...base, id: "pg3", parentId: "pg1", title: "개발 환경 설정", body: PG3_BODY, position: 1, createdBy: "u2", updatedBy: "u2", updatedAt: T_CREATE },
    { ...base, id: "pg4", parentId: "pg1", title: "배포 가이드", body: PG4_BODY, position: 2, createdBy: "u3", updatedBy: "u3", updatedAt: T_CREATE },
    // pg3의 하위 1개 — 깊이 3(손자) 검증용
    { ...base, id: "pg5", parentId: "pg3", title: "로컬 DB 설정", body: PG5_BODY, position: 1, createdBy: "u2", updatedBy: "u2", updatedAt: T_CREATE },
  ];

  const versions: PageVersion[] = [
    // pg1은 버전 2개 — 수정 이력 (v2 = 현재 본문)
    { id: "pv1", pageId: "pg1", version: 1, title: "시작하기", body: PG1_BODY_V1, savedBy: "u1", savedAt: T_CREATE },
    { id: "pv2", pageId: "pg1", version: 2, title: "시작하기", body: PG1_BODY, savedBy: "u2", savedAt: T_UPDATE },
    // 나머지는 각 v1 (현재 본문과 동일)
    { id: "pv3", pageId: "pg2", version: 1, title: "팀 규칙", body: PG2_BODY, savedBy: "u1", savedAt: T_CREATE },
    { id: "pv4", pageId: "pg3", version: 1, title: "개발 환경 설정", body: PG3_BODY, savedBy: "u2", savedAt: T_CREATE },
    { id: "pv5", pageId: "pg4", version: 1, title: "배포 가이드", body: PG4_BODY, savedBy: "u3", savedAt: T_CREATE },
    { id: "pv6", pageId: "pg5", version: 1, title: "로컬 DB 설정", body: PG5_BODY, savedBy: "u2", savedAt: T_CREATE },
  ];

  const comments: Comment[] = [
    { id: "c1", pageId: "pg1", authorId: "u2", body: "온보딩에 딱 필요한 내용이네요.", createdAt: T_COMMENT_1 },
    { id: "c2", pageId: "pg1", authorId: "u3", body: "배포 가이드 링크도 추가하면 좋겠습니다.", createdAt: T_COMMENT_2 },
  ];

  return {
    users: [...MOCK_USERS],
    spaces: [space],
    pages,
    versions,
    comments,
  };
}
