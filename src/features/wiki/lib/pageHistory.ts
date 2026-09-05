import { useCallback, useEffect, useState } from "react";
import type { Page, PageVersion, User } from "../store/types";
import { getPage, listUsers, listVersions } from "../store/wikiStore";
import { displayUserName } from "./userName";

/**
 * 페이지 히스토리 세 화면(표·이전 버전 보기·비교)이 공유하는 데이터와 표기 규칙.
 *
 * 세 화면 모두 "이 페이지의 버전 목록 + 사용자 이름"이 있어야 시작한다 — 화면마다 같은 로딩·
 * 실패 처리를 복제하면 한쪽만 고쳐져 표와 비교 화면이 서로 다른 이름·시각을 보여주게 된다.
 */

/** 버전 표기 "v. 7" — 컨플루언스 페이지 히스토리와 같은 형식(점 + 공백). */
export function versionLabel(version: number): string {
  return `v. ${version}`;
}

/**
 * 저장 시각 절대 표기(예: "2026. 7. 10. 오후 7:00:00"). 빈 값·무효 값은 ""다 —
 * 백엔드 모드에서 시각이 비어 올 때 표에 "Invalid Date"가 박히면 안 된다(설계 §9).
 */
export function formatVersionDateTime(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR");
}

/**
 * 버전을 저장한 사람의 표시 이름.
 * 디렉터리(ACTIVE만) → 저장 시점 스냅샷 이름(W23) → `사용자 #{id}` → "알 수 없음".
 * 퇴사한 사람이 고친 버전도 이름으로 읽혀야 한다.
 */
export function versionAuthorName(users: User[], version: PageVersion): string {
  return (
    users.find((u) => u.id === version.savedBy)?.name
    ?? version.savedByName
    ?? (version.savedBy ? displayUserName(version.savedBy) : "알 수 없음")
  );
}

export interface PageHistoryData {
  /** undefined = 로딩 중, null = 없는 페이지 */
  page: Page | null | undefined;
  /** null = 로딩 중. 스토어가 version 내림차순(최신 먼저)을 보장한다 */
  versions: PageVersion[] | null;
  /** 이름 표기용 디렉터리 — 실패는 빈 목록(부가 정보라 화면을 막지 않는다) */
  users: User[];
  /** 페이지·버전 로드 실패 — 빈 표로 삼키지 않고 화면이 에러 상태로 노출한다 */
  error: string | null;
  reload: () => void;
}

export function usePageHistory(pageId: string | undefined): PageHistoryData {
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  const [versions, setVersions] = useState<PageVersion[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    setPage(undefined);
    setVersions(null);
    setError(null);
    void Promise.all([getPage(pageId), listVersions(pageId)])
      .then(([loadedPage, loadedVersions]) => {
        if (cancelled) return;
        setPage(loadedPage);
        setVersions(loadedVersions);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, attempt]);

  useEffect(() => {
    void listUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  return { page, versions, users, error, reload };
}
