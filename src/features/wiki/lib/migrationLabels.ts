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
