import { useCallback, useEffect, useRef, useState } from "react";
import type { Page, PageVersion, User } from "../store/types";
import { getPage, getVersionByNumber, listUsers, listVersionPage } from "../store/wikiStore";
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

/** 히스토리 표 한 쪽 — 버전이 수백 개인 문서도 첫 화면은 이만큼만 읽는다. */
export const HISTORY_PAGE_SIZE = 50;

export interface PageHistoryData {
  /** undefined = 로딩 중, null = 없는 페이지 */
  page: Page | null | undefined;
  /** null = 로딩 중. 지금까지 읽은 쪽들 — version 내림차순(최신 먼저) */
  versions: PageVersion[] | null;
  /** 이 문서의 전체 버전 수(읽은 수가 아니다) */
  total: number;
  /** 아직 읽지 않은 더 오래된 버전이 있는가 */
  hasMore: boolean;
  /** 다음 쪽을 읽는 중 */
  loadingMore: boolean;
  /** 다음 쪽 읽기 실패 — 읽은 쪽은 그대로 두고 다시 시도할 수 있게 따로 둔다 */
  moreError: string | null;
  loadMore: () => void;
  /** 이름 표기용 디렉터리 — 실패는 빈 목록(부가 정보라 화면을 막지 않는다) */
  users: User[];
  /** 페이지·버전 로드 실패 — 빈 표로 삼키지 않고 화면이 에러 상태로 노출한다 */
  error: string | null;
  reload: () => void;
}

export function usePageHistory(pageId: string | undefined): PageHistoryData {
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  const [versions, setVersions] = useState<PageVersion[] | null>(null);
  const [total, setTotal] = useState(0);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** 페이지가 바뀌거나 다시 읽으면 늦게 온 "더 보기" 응답을 버리기 위한 세대 번호 */
  const generation = useRef(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    generation.current += 1;
    setPage(undefined);
    setVersions(null);
    setTotal(0);
    setNextBefore(null);
    setLoadingMore(false);
    setMoreError(null);
    setError(null);
    void Promise.all([getPage(pageId), listVersionPage(pageId, { limit: HISTORY_PAGE_SIZE })])
      .then(([loadedPage, first]) => {
        if (cancelled) return;
        setPage(loadedPage);
        setVersions(first.versions);
        setTotal(first.total);
        setNextBefore(first.nextBefore);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, attempt]);

  const loadMore = useCallback(() => {
    if (!pageId || nextBefore === null || loadingMore) return;
    const mine = generation.current;
    setLoadingMore(true);
    setMoreError(null);
    void listVersionPage(pageId, { before: nextBefore, limit: HISTORY_PAGE_SIZE })
      .then((next) => {
        if (generation.current !== mine) return;
        // 번호 커서라 겹치지 않지만, 같은 쪽을 두 번 받는 경합에서도 행이 중복되지 않게 거른다.
        setVersions((prev) => {
          const seen = new Set((prev ?? []).map((v) => v.version));
          return [...(prev ?? []), ...next.versions.filter((v) => !seen.has(v.version))];
        });
        setTotal(next.total);
        setNextBefore(next.nextBefore);
      })
      .catch((e: unknown) => {
        if (generation.current === mine) setMoreError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (generation.current === mine) setLoadingMore(false);
      });
  }, [pageId, nextBefore, loadingMore]);

  useEffect(() => {
    void listUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  return {
    page,
    versions,
    total,
    hasMore: nextBefore !== null,
    loadingMore,
    moreError,
    loadMore,
    users,
    error,
    reload,
  };
}

export interface PageVersionsData {
  /** undefined = 로딩 중, null = 없는 페이지 */
  page: Page | null | undefined;
  /**
   * 요청한 번호 순서 그대로의 버전(본문 포함). null 항목 = 이력에 없는 번호.
   * undefined = 로딩 중.
   */
  versions: (PageVersion | null)[] | undefined;
  /** 가장 최신 버전 번호(이력이 없으면 null) — "현재" 판정. undefined = 로딩 중 */
  currentVersion: number | null | undefined;
  users: User[];
  error: string | null;
  reload: () => void;
}

/**
 * 이전 버전 보기·비교 화면용 — 버전 **번호**로 바로 읽는다.
 *
 * 예전에는 이력 전체 목록에서 메타를 찾아 본문을 따로 읽었다. 목록을 쪽 단위로 읽게 된 뒤로는
 * 첫 쪽 밖의 버전(공유된 "v. 3" 링크)을 열 수 없게 되므로 목록에 기대지 않는다. 현재 버전은
 * `page.version`이다.
 */
export function usePageVersions(pageId: string | undefined, numbers: number[]): PageVersionsData {
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  const [versions, setVersions] = useState<(PageVersion | null)[] | undefined>(undefined);
  const [currentVersion, setCurrentVersion] = useState<number | null | undefined>(undefined);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = numbers.join(",");

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    setPage(undefined);
    setVersions(undefined);
    setCurrentVersion(undefined);
    setError(null);
    const wanted = key === "" ? [] : key.split(",").map(Number);
    // 최신 번호는 한 줄짜리 쪽으로 묻는다 — page.version과 이력 번호가 어긋난 옛 데이터에서도
    // "현재" 배지가 이력의 실제 최신을 가리키게.
    void Promise.all([
      getPage(pageId),
      Promise.all(wanted.map((n) => getVersionByNumber(pageId, n))),
      listVersionPage(pageId, { limit: 1 }),
    ])
      .then(([loadedPage, loaded, latest]) => {
        if (cancelled) return;
        setPage(loadedPage);
        setVersions(loaded);
        setCurrentVersion(latest.versions[0]?.version ?? null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, key, attempt]);

  useEffect(() => {
    void listUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  return { page, versions, currentVersion, users, error, reload };
}
