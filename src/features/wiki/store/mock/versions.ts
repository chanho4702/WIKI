// 버전 스냅샷·이력·복원 목업.
import { CURRENT_USER_ID } from "../../../../mock/users";
import type { Page, PageVersion, VersionPage, WikiData } from "../types";
import { clone, load, nextId } from "./db";
import { updatePage } from "./pages";

/** 버전 스냅샷 부수효과: 현재 페이지 내용을 version = max+1로 쌓는다 */
export function snapshotVersion(data: WikiData, page: Page, at: string, changeNote?: string): void {
  const maxVersion = data.versions
    .filter((v) => v.pageId === page.id)
    .reduce((max, v) => Math.max(max, v.version), 0);
  const version = maxVersion + 1;
  page.version = version;
  data.versions.push({
    id: nextId(),
    pageId: page.id,
    version,
    title: page.title,
    body: page.body,
    savedBy: CURRENT_USER_ID,
    savedByName: data.users.find((u) => u.id === CURRENT_USER_ID)?.name ?? null,
    savedAt: at,
    // 공백만 있는 요약은 없는 것과 같다(백엔드와 같은 규칙) — 화면이 빈 칩을 그리지 않도록.
    changeNote: changeNote?.trim() ? changeNote.trim() : undefined,
  });
}

export async function listVersions(pageId: string): Promise<PageVersion[]> {
  return clone(
    load()
      .versions.filter((v) => v.pageId === pageId)
      .sort((a, b) => b.version - a.version), // 최신 먼저
  );
}

/** 백엔드 RevisionController.page와 같은 상한·기본값. */
const VERSION_PAGE_DEFAULT = 50;

const VERSION_PAGE_MAX = 100;

/**
 * 이력 한 쪽 — 백엔드와 같이 메타만 준다(title·body 빈 값). 목업이 본문까지 주면 화면이 목업에서만
 * 목록의 본문에 기대는 코드를 품게 된다.
 */
export async function listVersionPage(
  pageId: string,
  options: { before?: number | null; limit?: number } = {},
): Promise<VersionPage> {
  const size = Math.max(1, Math.min(options.limit ?? VERSION_PAGE_DEFAULT, VERSION_PAGE_MAX));
  const all = load()
    .versions.filter((v) => v.pageId === pageId)
    .sort((a, b) => b.version - a.version);
  const before = options.before;
  const rest = before == null ? all : all.filter((v) => v.version < before);
  const items = rest.slice(0, size);
  return {
    versions: clone(items).map((v) => ({ ...v, title: "", body: "" })),
    nextBefore: rest.length > size ? items[items.length - 1].version : null,
    total: all.length,
  };
}

export async function getVersionByNumber(pageId: string, version: number): Promise<PageVersion | null> {
  const found = load().versions.find((v) => v.pageId === pageId && v.version === version);
  return found ? clone(found) : null;
}

/** 한 버전의 본문까지 — 백엔드 모드와 같은 계약(목록은 메타만, 본문은 단건 조회). */
export async function getVersion(pageId: string, versionId: string): Promise<PageVersion> {
  const version = load().versions.find((v) => v.id === versionId && v.pageId === pageId);
  if (!version) throw new Error("버전을 찾을 수 없습니다");
  return clone(version);
}

export async function restoreVersion(
  pageId: string,
  versionId: string,
  changeNote?: string,
): Promise<Page> {
  const data = load();
  const version = data.versions.find((v) => v.id === versionId && v.pageId === pageId);
  if (!version) throw new Error("버전을 찾을 수 없습니다");
  // updatePage 경로 재사용 → 복원도 새 버전으로 쌓인다 (히스토리 안 끊김).
  // 어느 버전에서 되돌렸는지가 다음 사람에게 가장 중요한 정보다(백엔드와 같은 문구) —
  // 화면이 요약을 받아 넘기면 그것을 쓰고, 비워 두면 이 기본 문구가 남는다.
  return updatePage(
    pageId,
    { title: version.title, body: version.body },
    { changeNote: changeNote ?? `v${version.version} 버전으로 복원` },
  );
}

// ── comments ─────────────────────────────────────────────────
