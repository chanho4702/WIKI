// 감사 로그·검색 색인 관리 목업.
import type { AuditEntry } from "../types";
import { load } from "./db";

/** 스페이스 삭제 기록 — 목업은 전역 관리자 판정이 없어 그대로 돌려준다. */
export async function listSpaceDeletions(): Promise<AuditEntry[]> {
  return [...(load().spaceAudit ?? [])];
}

/** 목업에는 감사 기록이 없다 — 빈 목록이면 화면이 "기록이 없습니다"로 접힌다. */
export async function listAudit(_spaceId: string): Promise<import("../types").AuditEntry[]> {
  return [];
}

export async function listGrantAudit(_spaceId: string): Promise<import("../types").AuditEntry[]> {
  return []; // 목업에는 org 원장이 없다 — 위키 감사와 같이 빈 목록이다
}

/** 목업에는 검색 색인이 없다 — null은 "권한 없음"과 같은 취급을 받아 관리 메뉴가 뜨지 않는다. */
export async function getSearchIndexStatus(): Promise<null> {
  return null;
}

export async function startReindex(): Promise<never> {
  throw new Error("목업 모드에서는 재색인을 지원하지 않습니다");
}

export async function getReindexJob(_jobId: string): Promise<never> {
  throw new Error("목업 모드에서는 재색인을 지원하지 않습니다");
}
