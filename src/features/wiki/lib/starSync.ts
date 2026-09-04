import { listStars, setPageStar, setSpaceStar } from "../store/wikiStore";
import { getStarredPageEntries, setStarredPageEntries } from "./starredPages";
import { getStarredSpaces, setStarredSpaces } from "./starredSpaces";
import { scopedStorageKey } from "./storageKey";

/**
 * 별표의 서버 동기화(W23).
 *
 * 별표는 지금까지 브라우저 localStorage에만 있었다 — 회사 노트북에서 별표한 문서가 집
 * 컴퓨터에는 없고, 브라우저 데이터를 한 번 지우면 통째로 사라졌다.
 *
 * 서버를 원장으로 삼되 **localStorage는 그대로 둔다**: 화면은 계속 그 사본을 즉시 읽어 그리고
 * (첫 렌더에 네트워크를 기다리지 않는다), 동기화가 끝나면 사본이 원장으로 덮인다. 토글은
 * 사본을 먼저 바꾸고 서버로 보낸다 — 별 하나 누르는 데 왕복을 기다릴 이유가 없다.
 *
 * 목업 모드에서는 `listStars()`가 null을 준다. 그때는 브라우저에 있는 것이 곧 전부이므로
 * 아무것도 하지 않는다.
 */

// 별표 원장과 한 몸인 플래그 — 원장을 갈랐으면 이 표시도 함께 갈라야 한다
const MIGRATED_KEY = scopedStorageKey("wiki.ui.starsMigrated");

function alreadyMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === "1";
  } catch {
    return true; // 저장소를 못 읽으면 이관 여부도 알 수 없다 — 두 번 올리는 쪽이 더 나쁘다
  }
}

function markMigrated(): void {
  try {
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // 저장 실패 — 다음 실행에서 한 번 더 시도한다. 서버 쪽이 멱등이라 중복되지 않는다.
  }
}

/**
 * 서버 원장을 브라우저 사본에 반영한다. 앱이 뜰 때 한 번 부른다.
 *
 * 서버가 비어 있고 브라우저에만 별표가 있으면 **한 번만** 올려 보낸다 — 이 기능이 생기기 전에
 * 모아 둔 별표를 잃지 않기 위해서다. 이관 표시를 남겨, 나중에 사용자가 스스로 전부 지운 것을
 * 다시 되살리는 일이 없게 한다.
 */
export async function syncStarsFromServer(): Promise<void> {
  let snapshot;
  try {
    snapshot = await listStars();
  } catch {
    return; // 서버를 못 읽는다고 화면을 막지 않는다 — 사본으로 계속 동작한다
  }
  if (snapshot === null) return; // 목업: 서버 원장이 없다

  const localPages = getStarredPageEntries();
  const localSpaces = getStarredSpaces();
  const serverEmpty = snapshot.pages.length === 0 && snapshot.spaceIds.length === 0;
  const localHasSomething = localPages.length > 0 || localSpaces.length > 0;

  if (serverEmpty && localHasSomething && !alreadyMigrated()) {
    await Promise.allSettled([
      ...localPages.map((entry) => setPageStar(entry.id, true)),
      ...localSpaces.map((id) => setSpaceStar(id, true)),
    ]);
    markMigrated();
    return; // 사본이 이미 정답이다 — 덮어쓸 이유가 없다
  }

  markMigrated();
  setStarredPageEntries(
    snapshot.pages.map((row) => ({
      id: row.id,
      spaceId: row.spaceId,
      title: row.title,
      icon: row.icon,
      type: row.type === "folder" ? ("folder" as const) : ("page" as const),
    })),
  );
  setStarredSpaces(snapshot.spaceIds);
}

/**
 * 토글의 서버 반영. 실패해도 사본은 되돌리지 않는다 — 다음 동기화가 바로잡고, 그전까지는
 * 사용자가 방금 누른 대로 보이는 쪽이 덜 혼란스럽다.
 */
export function pushPageStar(pageId: string, starred: boolean): void {
  void setPageStar(pageId, starred).catch(() => {});
}

export function pushSpaceStar(spaceId: string, starred: boolean): void {
  void setSpaceStar(spaceId, starred).catch(() => {});
}
