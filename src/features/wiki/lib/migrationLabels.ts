import type {
  MigrationIssueSeverity,
  MigrationItemStatus,
  MigrationJobStatus,
  MigrationMode,
  MigrationStage,
} from "../store/types";

/**
 * 마이그레이션 열거값의 한국어 표기(M1).
 *
 * 스토어는 백엔드 enum 이름(`DEAD_LETTER`·`MEDIA_COPY`)을 그대로 들고 다닌다 — 값을 화면용으로
 * 바꿔 저장하면 백엔드가 값을 하나 더할 때 두 곳이 조용히 갈린다. 번역은 **표시 직전 한 곳**에서만
 * 한다. 모르는 값이 오면 원문을 그대로 보여준다(빈칸이면 무슨 일이 났는지 알 수 없다).
 */

const JOB_STATUS: Record<MigrationJobStatus, string> = {
  PENDING: "대기",
  RUNNING: "진행 중",
  COMPLETED: "완료",
  FAILED: "실패",
  CANCELLED: "취소됨",
};

const ITEM_STATUS: Record<MigrationItemStatus, string> = {
  PENDING: "대기",
  RUNNING: "진행 중",
  RETRY_WAIT: "재시도 대기",
  COMPLETED: "완료",
  DEAD_LETTER: "데드레터",
};

const STAGE: Record<MigrationStage, string> = {
  EXTRACT: "추출",
  NORMALIZE: "정규화",
  MEDIA_COPY: "첨부 복사",
  RESOLVE: "페이지 작성",
  VERIFY: "검증",
  DONE: "완료",
};

const MODE: Record<MigrationMode, string> = {
  DRY_RUN: "시험 실행",
  IMPORT: "실제 이관",
};

const SEVERITY: Record<MigrationIssueSeverity, string> = {
  ERROR: "오류",
  WARNING: "경고",
  INFO: "안내",
};

/** 심각도 정렬 순서 — 오류가 먼저다. 알 수 없는 값은 맨 뒤. */
const SEVERITY_RANK: Record<string, number> = { ERROR: 0, WARNING: 1, INFO: 2 };

export function jobStatusLabel(value: string): string {
  return JOB_STATUS[value as MigrationJobStatus] ?? value;
}

export function itemStatusLabel(value: string): string {
  return ITEM_STATUS[value as MigrationItemStatus] ?? value;
}

export function stageLabel(value: string): string {
  return STAGE[value as MigrationStage] ?? value;
}

export function modeLabel(value: string): string {
  return MODE[value as MigrationMode] ?? value;
}

export function severityLabel(value: string): string {
  return SEVERITY[value as MigrationIssueSeverity] ?? value;
}

export function severityRank(value: string): number {
  return SEVERITY_RANK[value] ?? 9;
}

/** 잡 상태 → Lozenge 색. 실패·취소는 같은 "끝났고 결과가 없다"가 아니라 서로 다른 사건이다. */
export function jobStatusAppearance(value: string): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (value) {
    case "RUNNING":
      return "info";
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "danger";
    case "CANCELLED":
      return "warning";
    default:
      return "neutral";
  }
}

/**
 * 손실 보고서 코드의 한국어 설명.
 *
 * 코드 자체(`ATTACHMENT_TOO_LARGE`)는 표에 그대로 남긴다 — 백엔드 로그·문서와 같은 말로 검색해야
 * 원인을 찾을 수 있기 때문이다. 이 함수는 그 옆에 붙는 "무슨 뜻인가" 한 줄이다. 모르는 코드는
 * 빈칸으로 둔다(원문이 이미 옆 칸에 있다).
 */
const ISSUE_CODE: Record<string, string> = {
  // 변환 손실 — 우리 문법에 자리가 없어 떼어낸 것들
  MACRO_OPAQUE: "원본 매크로를 옮기지 못해 안내 문구로 남겼습니다",
  MARK_DROPPED: "우리 문법에 없는 서식(밑줄·팔레트 밖 색)을 뗐습니다",
  TABLE_SPAN_DROPPED: "표의 병합 셀을 펴지 못해 평범한 셀로 눕혔습니다",
  MEDIA_UNRESOLVED: "가리키는 파일을 찾지 못한 이미지·첨부입니다",
  TITLE_TRUNCATED: "제목이 255자를 넘어 잘랐습니다",

  // 첨부(M2)
  ATTACHMENT_PLANNED: "시험 실행이라 받지 않았습니다 — 실제 이관에서 옮깁니다",
  ATTACHMENT_TOO_LARGE: "파일이 크기 상한을 넘어 옮기지 않았습니다",
  ATTACHMENT_NOT_COPIED: "첨부 본체를 옮기지 못했습니다",
  ATTACHMENT_REF_UNRESOLVED: "본문이 가리키는 파일의 첨부를 찾지 못해 참조를 그대로 두었습니다",

  // 링크(M2)
  LINK_EXTERNAL_SPACE: "다른 스페이스로 가는 링크라 원본 주소로 남겼습니다",
  LINK_ANCHOR_DROPPED: "위키링크에는 앵커를 실을 수 없어 문서 첫머리로 갑니다",
  LINK_UNRESOLVED: "가리키는 문서를 찾지 못해 원본 주소로 되돌렸습니다",
  LINK_AMBIGUOUS: "같은 제목의 문서가 여럿이라 어느 것인지 정하지 못했습니다",
  ANCHOR_DROPPED: "대상 문서에 맞는 헤딩이 없어 앵커만 뗐습니다",

  // 제한·작성자
  RESTRICTION_PRINCIPAL_UNMAPPED: "원본 제한의 사용자·그룹을 대조하지 못해 요청자만 볼 수 있게 닫았습니다",
  AUTHOR_UNMAPPED: "원본 작성자를 우리 계정과 대조하지 못해 원본 이름으로 표시합니다",

  // 댓글·이력(M3)
  INLINE_COMMENT_DEMOTED: "본문 구간에 붙은 댓글이라 페이지 댓글로 내리고 원문을 인용했습니다",
  COMMENT_NOT_MIGRATED: "댓글 본문을 옮기지 못해 그 댓글만 건너뛰었습니다",
  COMMENT_REPLY_FLATTENED: "답글의 답글이라 최상위 답글로 폈습니다(중첩은 1단까지입니다)",
  HISTORY_VERSION_SKIPPED: "지난 버전 하나를 옮기지 못해 이력에서 빠졌습니다",

  // 원본 상태
  SOURCE_VERSION_DRIFT: "발견한 뒤 원본이 수정돼 최신본을 옮겼습니다",
  PARENT_NOT_FOUND: "상위 문서를 찾지 못해 최상단에 두었습니다",

  // 검증
  VERIFY_PAGE_MISSING: "옮긴 문서를 찾을 수 없습니다",
  VERIFY_TITLE_MISMATCH: "옮긴 문서의 제목이 원본과 다릅니다",
  VERIFY_BODY_EMPTY: "옮긴 문서의 본문이 비어 있습니다",
  VERIFY_LABEL_MISMATCH: "옮긴 문서의 라벨 수가 원본과 다릅니다",
  VERIFY_TYPE_MISMATCH: "블로그 글과 일반 문서가 뒤바뀌어 목록에서 보이지 않습니다",
  VERIFY_MARKDOWN_MISSING: "변환 결과가 남아 있지 않습니다",
};

export function issueCodeLabel(value: string): string {
  return ISSUE_CODE[value] ?? "";
}
