import { useCallback, useSyncExternalStore } from "react";
import { pushPageStar } from "./starSync";

/**
 * 페이지 별표(즐겨찾기) — starredSpaces.ts와 동일한 패턴(별도 키의 병렬 모듈,
 * pageWidth/sidebarPrefs 관례). 페이지 보기 헤더의 별 토글과 사이드바 "별표 표시" 검색 패널이
 * 공유하는 전역 상태다. 도메인 데이터가 아니라 이 브라우저의 UI 프리퍼런스이므로
 * store 계약을 확장하지 않고 lib에 둔다 — 서버 사용자 설정 승격은 백엔드 정책 결정 목록 항목.
 *
 * v2(2026-08-23): id 배열 → 메타데이터 스냅샷 배열. 별표 패널이 검색형(제목 필터)이 되면서
 * 다른 스페이스 페이지의 제목·경로를 알아야 한다 — 별표 시점의 {id, spaceId, title, icon}을
 * 저장하고, 해당 스페이스 트리를 로드할 때마다 hydrate로 최신화한다(개명 반영).
 * 구버전(문자열 배열) 저장분은 읽기 시점에 {id}만 있는 엔트리로 승격되고, 그 스페이스에
 * 다시 들어가면 hydrate가 제목을 채운다.
 */
const STORAGE_KEY = "wiki.ui.starredPages";

export interface StarredPageEntry {
  id: string;
  /** 별표 시점 스냅샷 — 구버전 데이터는 빈 문자열(다음 방문 때 hydrate로 채워진다). */
  spaceId: string;
  title: string;
  icon?: string | null;
  /** 라우트 분기용(폴더는 folder 화면) — 구버전 엔트리는 "page"로 간주. */
  type?: "page" | "folder";
}

function isEntry(v: unknown): v is StarredPageEntry {
  return typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string";
}

function readFromStorage(): StarredPageEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((v): StarredPageEntry[] => {
      if (typeof v === "string") return [{ id: v, spaceId: "", title: "" }]; // v1 호환
      if (isEntry(v)) {
        return [
          {
            id: v.id,
            spaceId: typeof v.spaceId === "string" ? v.spaceId : "",
            title: typeof v.title === "string" ? v.title : "",
            icon: typeof v.icon === "string" ? v.icon : null,
            type: v.type === "folder" ? "folder" : "page",
          },
        ];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function entriesEqual(a: StarredPageEntry[], b: StarredPageEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (v, i) =>
        v.id === b[i].id && v.spaceId === b[i].spaceId && v.title === b[i].title && v.icon === b[i].icon &&
        v.type === b[i].type,
    )
  );
}

const listeners = new Set<() => void>();
let cachedSnapshot: StarredPageEntry[] = readFromStorage();

function getSnapshot(): StarredPageEntry[] {
  const next = readFromStorage();
  if (!entriesEqual(next, cachedSnapshot)) {
    cachedSnapshot = next;
  }
  return cachedSnapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStarredPageEntries(): StarredPageEntry[] {
  return readFromStorage();
}

export function getStarredPages(): string[] {
  return getStarredPageEntries().map((e) => e.id);
}

export function setStarredPageEntries(entries: StarredPageEntry[]): void {
  try {
    if (entries.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    // 저장 실패(용량 초과, 접근 차단 등) — 조용히 무시
  }
  listeners.forEach((listener) => listener());
}

/**
 * 스페이스 트리 로드 시 스냅샷 최신화 — 개명·이모지 변경 반영 + 구버전(메타 없는) 엔트리 채움.
 * 이 스페이스에 없는 별표는 건드리지 않는다(다른 스페이스의 별표를 지우면 안 된다).
 */
export function hydrateStarredPages(
  spaceId: string,
  pages: Array<{ id: string; title: string; icon?: string | null; type?: "page" | "folder" }>,
): void {
  const current = getStarredPageEntries();
  const byId = new Map(pages.map((p) => [p.id, p]));
  let changed = false;
  const next = current.map((entry) => {
    const page = byId.get(entry.id);
    if (!page) return entry;
    const icon = page.icon ?? null;
    const type = page.type === "folder" ? "folder" as const : "page" as const;
    if (
      entry.spaceId === spaceId && entry.title === page.title &&
      (entry.icon ?? null) === icon && entry.type === type
    ) return entry;
    changed = true;
    return { id: entry.id, spaceId, title: page.title, icon, type };
  });
  if (changed) setStarredPageEntries(next);
}

/** 삭제된 페이지의 죽은 id가 별표 목록에 영구히 남지 않게 — 페이지 목록 로드 시 1회 호출. */
export function pruneStarredPages(validIds: string[]): void {
  const current = getStarredPageEntries();
  const pruned = current.filter((e) => validIds.includes(e.id));
  if (pruned.length !== current.length) {
    setStarredPageEntries(pruned);
  }
}

/** 페이지 삭제 경로에서 해당 별표를 즉시 제거한다. */
export function removeStarredPage(pageId: string): void {
  const current = getStarredPageEntries();
  if (current.some((e) => e.id === pageId)) {
    setStarredPageEntries(current.filter((e) => e.id !== pageId));
  }
}

export function useStarredPages(): {
  /** 별표된 페이지 id 목록 — 별 토글 활성 판정용. */
  starred: string[];
  /** 메타데이터 포함 엔트리 — 별표 검색 패널용. */
  entries: StarredPageEntry[];
  toggle: (page: {
    id: string; spaceId: string; title: string; icon?: string | null; type?: "page" | "folder";
  }) => void;
} {
  const entries = useSyncExternalStore(subscribe, getSnapshot);
  const toggle = useCallback((page: {
    id: string; spaceId: string; title: string; icon?: string | null; type?: "page" | "folder";
  }) => {
    const current = getStarredPageEntries();
    const starred = !current.some((e) => e.id === page.id);
    const next = starred
      ? [...current, {
          id: page.id, spaceId: page.spaceId, title: page.title,
          icon: page.icon ?? null, type: page.type === "folder" ? "folder" as const : "page" as const,
        }]
      : current.filter((e) => e.id !== page.id);
    setStarredPageEntries(next);
    // 사본을 먼저 바꾸고 서버로 보낸다 — 별 하나 누르는 데 왕복을 기다릴 이유가 없다(W23).
    pushPageStar(page.id, starred);
  }, []);
  return { starred: entries.map((e) => e.id), entries, toggle };
}
