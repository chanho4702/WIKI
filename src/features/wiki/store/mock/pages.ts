// 문서 CRUD·이동·복사·게시·삭제·메타(아이콘·소유자·검증)·블로그 목업.
import { CURRENT_USER_ID } from "../../../../mock/users";
import { defaultVerifiedUntil } from "../../lib/verification";
import {
  type BlogPost,
  type CopyPageOptions,
  type DeletePageOptions,
  MoveImpactError,
  type Page,
  PageConflictError,
  type PageStatus,
  type PageType,
  type RestrictionPrincipal,
  type UpdatePageOptions,
} from "../types";
import { canSeePage, clone, load, nextId, persist } from "./db";
import { autoWatch, notifyPagePublished, notifyPageUpdated } from "./notifications";
import { snapshotVersion } from "./versions";

export async function getPage(id: string): Promise<Page | null> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  // 볼 수 없는 초안은 없는 문서와 같다(서버도 존재를 드러내지 않는다)
  return page && canSeePage(data, page) ? clone(page) : null;
}

export async function createPage(input: {
  spaceId: string;
  parentId?: string | null;
  title: string;
  body?: string;
  /** 생략 시 일반 페이지. 폴더는 body를 쓰지 않는다(P1 결정). */
  type?: PageType;
  /** 생략 시 게시됨. 사이드바 "+"로 만드는 임시 문서만 "draft"로 만든다(P3 결정). */
  status?: PageStatus;
}): Promise<Page> {
  const data = load();
  if (!data.spaces.some((s) => s.id === input.spaceId)) {
    throw new Error("스페이스를 찾을 수 없습니다");
  }
  const parentId = input.parentId ?? null;
  if (parentId !== null) {
    const parent = data.pages.find((p) => p.id === parentId);
    if (!parent) throw new Error("부모 페이지를 찾을 수 없습니다");
    if (parent.spaceId !== input.spaceId) {
      throw new Error("부모 페이지가 같은 스페이스에 없습니다");
    }
  }
  const title = input.title.trim();
  if (!title) throw new Error("페이지 제목을 입력하세요");
  const now = new Date().toISOString();
  // position = 형제(같은 스페이스·같은 부모) 내 max+1
  const maxPosition = data.pages
    .filter((p) => p.spaceId === input.spaceId && p.parentId === parentId)
    .reduce((max, p) => Math.max(max, p.position), 0);
  const page: Page = {
    id: nextId(),
    spaceId: input.spaceId,
    parentId,
    type: input.type ?? "page",
    // 폴더는 게시 개념이 없다 — status를 넘겨도 무시하고 항상 게시 상태로 둔다.
    status: input.type === "folder" ? "published" : (input.status ?? "published"),
    ...(input.type === "blog" ? { parentId: null } : {}),
    title,
    body: input.body ?? "",
    version: 1,
    position: maxPosition + 1,
    createdBy: CURRENT_USER_ID,
    updatedBy: CURRENT_USER_ID,
    createdAt: now,
    updatedAt: now,
  };
  data.pages.push(page);
  snapshotVersion(data, page, now); // v1 자동 스냅샷
  autoWatch(data, page.id, CURRENT_USER_ID); // 만든 문서는 자동 구독(W21-4)
  // 곧바로 게시된 문서는 그 순간이 곧 "새 문서 게시"다 — publish 경로만 알리면 대부분의 문서가
  // 스페이스 구독자에게 조용히 지나간다(W27-4). 폴더는 읽을 내용이 없으므로 제외한다.
  if (page.status === "published" && page.type !== "folder") notifyPagePublished(data, page);
  persist();
  return clone(page);
}

// ── versions ─────────────────────────────────────────────────

export async function updatePage(
  id: string,
  patch: { title?: string; body?: string },
  options: UpdatePageOptions = {},
): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  if (options.expectedVersion !== undefined && options.expectedVersion !== page.version) {
    throw new PageConflictError(clone(page));
  }
  const nextTitle = patch.title !== undefined ? patch.title.trim() : page.title;
  if (!nextTitle) throw new Error("페이지 제목을 입력하세요");
  const nextBody = patch.body !== undefined ? patch.body : page.body;
  // 둘 다 무변경이면 no-op — 버전·updatedBy/updatedAt 불변
  if (nextTitle === page.title && nextBody === page.body) {
    return clone(page);
  }
  const oldBody = page.body;
  page.title = nextTitle;
  page.body = nextBody;
  page.updatedBy = CURRENT_USER_ID;
  page.updatedAt = new Date().toISOString();
  snapshotVersion(data, page, page.updatedAt, options.changeNote); // 적용 후 내용을 새 버전(max+1)으로
  autoWatch(data, page.id, CURRENT_USER_ID); // 고친 문서는 자동 구독(W21-4)
  notifyPageUpdated(data, page, oldBody, nextBody);
  persist();
  return clone(page);
}

/**
 * 페이지 이모지 아이콘 설정/해제(null) — 이동(movePage)과 같은 메타데이터 변경 취급이다:
 * 내용이 안 바뀌므로 버전 스냅샷을 쌓지 않고 updatedAt도 건드리지 않는다.
 */
export async function setPageIcon(id: string, icon: string | null): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  page.icon = icon;
  persist();
  return clone(page);
}

/**
 * 조회 1회 기록 — 페이지 보기 화면 진입 시 호출한다. 누적 조회수를 돌려준다.
 * 컨플루언스처럼 정교한 중복 제거(사용자별 유니크)는 백엔드 몫 — 목업은 단순 누적.
 */
export async function recordPageView(id: string): Promise<number> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  page.views = (page.views ?? 0) + 1;
  persist();
  return page.views;
}

/* ── 페이지 제한 (W18) — 목업은 저장·상속 표시만 담당한다(단일 사용자라 강제 판정은
 * 백엔드 모드의 몫). 자물쇠 다이얼로그 기능 검증용. ────────────────────── */

/**
 * 초안을 게시한다. 이미 게시된 문서면 no-op(버전·updatedAt 불변) — updatePage의 무변경 no-op과
 * 같은 규칙이다. 게시는 "내용 변경"이 아니므로 버전 스냅샷을 쌓지 않는다(movePage와 같은 취급).
 */
export async function publishPage(id: string): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  if (page.status === "published") return clone(page);
  if (!page.title.trim()) throw new Error("제목을 입력해야 게시할 수 있습니다");
  page.status = "published";
  notifyPagePublished(data, page); // 스페이스 구독자가 기다리던 사건(W27-4)
  persist();
  return clone(page);
}

/**
 * 단일 페이지 복제 — 백엔드 v1 계약과 동일한 범위: 하위·댓글 미복사, 제목 "(사본)",
 * 부모·타입·상태 유지, 형제 맨 뒤. (목업엔 첨부 저장이 없어 첨부 복사는 해당 없음.)
 */
export async function copyPage(id: string, options?: CopyPageOptions): Promise<Page> {
  const data = load();
  const source = data.pages.find((p) => p.id === id);
  if (!source) throw new Error("페이지를 찾을 수 없습니다");
  const siblings = data.pages.filter(
    (p) => p.spaceId === source.spaceId && p.parentId === source.parentId,
  );
  const now = new Date().toISOString();

  // 부모가 먼저 오는 순서로 모은다 — 자식이 부모의 새 id를 필요로 한다.
  const ordered: Page[] = [source];
  if (options?.includeDescendants) {
    for (let i = 0; i < ordered.length; i++) {
      ordered.push(...data.pages.filter((p) => p.parentId === ordered[i].id));
    }
  }

  const newIdOf = new Map<string, string>();
  let root: Page | null = null;
  for (const original of ordered) {
    const isRoot = original.id === source.id;
    const copy: Page = {
      ...clone(original),
      id: nextId(),
      // 사본 표시는 뿌리에만 — 하위까지 제목을 바꾸면 본문의 `[[제목]]`이 전부 어긋난다.
      title: isRoot ? `${original.title} (사본)` : original.title,
      parentId: isRoot ? original.parentId : (newIdOf.get(original.parentId ?? "") ?? null),
      position: isRoot ? Math.max(0, ...siblings.map((p) => p.position)) + 1 : original.position,
      version: 1,
      createdBy: CURRENT_USER_ID,
      updatedBy: CURRENT_USER_ID,
      createdAt: now,
      updatedAt: now,
      // 사본은 원본의 소유자·검증을 물려받지 않는다(W27-5) — 아무도 읽지 않은 문서가 "검증됨"으로
      // 태어나면 배지가 거짓말이 된다. 백엔드 copy도 새 Page를 만들어 같은 결과다.
      ownerId: null,
      verifiedAt: null,
      verifiedBy: null,
      verifiedUntil: null,
      // 사본은 우리 쪽에서 새로 만든 문서다 — 원본 위키 표시(W29 M3)를 물려받으면 만든 적 없는
      // 컨플루언스 문서를 가리키는 링크가 생긴다. 백엔드 copy도 새 Page를 만들어 같은 결과다.
      importedAuthorName: null,
      importedSourceUrl: null,
    };
    newIdOf.set(original.id, copy.id);
    data.pages.push(copy);
    if (isRoot) root = copy;
  }
  persist();
  return clone(root as Page);
}

/* ── 페이지 템플릿(W23) ──────────────────────────────────── */

export async function deletePage(id: string, options?: DeletePageOptions): Promise<void> {
  const data = load();
  const index = data.pages.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("페이지를 찾을 수 없습니다");
  const target = data.pages[index];
  const hasChildren = data.pages.some((p) => p.parentId === id);
  // 옵션이 없으면 기존 계약 그대로 거부한다 — 자식을 어떻게 할지는 호출측이 명시할 때만 정해진다.
  if (hasChildren && !options?.children) {
    throw new Error("하위 페이지가 있어 삭제할 수 없습니다");
  }

  // 지울 대상 집합: promote면 자기 자신만, cascade면 후손 전부.
  // visited: 손상 데이터(parentId 순환)에서도 무한 루프하지 않는다 (movePage 순환 가드와 같은 방어)
  const doomed = new Set<string>([id]);
  if (hasChildren && options?.children === "cascade") {
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of data.pages) {
        if (child.parentId === current && !doomed.has(child.id)) {
          doomed.add(child.id);
          queue.push(child.id);
        }
      }
    }
  }

  if (hasChildren && options?.children === "promote") {
    // 자식을 삭제 대상의 부모로 올린다. 대상이 있던 자리(position)를 이어받게 해
    // 트리에서 보이던 위치가 유지되게 한다 — 승격이 곧 순서 뒤섞임이 되면 안 된다.
    const promoted = data.pages
      .filter((p) => p.parentId === id)
      .sort((a, b) => a.position - b.position);
    const siblings = data.pages
      .filter(
        (p) =>
          p.spaceId === target.spaceId && p.parentId === target.parentId && !doomed.has(p.id),
      )
      .sort((a, b) => a.position - b.position);
    const insertAt = siblings.filter((p) => p.position < target.position).length;
    siblings.splice(insertAt, 0, ...promoted);
    promoted.forEach((p) => {
      p.parentId = target.parentId;
    });
    siblings.forEach((p, i) => {
      p.position = i + 1; // 형제 내 1..n 연속 재부여
    });
  }

  // W21-1: 지우지 않고 휴지통으로 옮긴다. 버전·댓글도 함께 보관해야 복원이 원래 상태를 되돌린다.
  const deletedAt = new Date().toISOString();
  data.trash ??= [];
  for (const doomedId of doomed) {
    const page = data.pages.find((p) => p.id === doomedId);
    if (!page) continue;
    data.trash.push({
      page: clone(page),
      deletedAt,
      deletedBy: CURRENT_USER_ID,
      root: doomedId === id,
      versions: data.versions.filter((v) => v.pageId === doomedId).map(clone),
      comments: data.comments.filter((c) => c.pageId === doomedId).map(clone),
    });
  }
  data.pages = data.pages.filter((p) => !doomed.has(p.id));
  data.versions = data.versions.filter((v) => !doomed.has(v.pageId));
  data.comments = data.comments.filter((c) => !doomed.has(c.pageId));
  persist();
}

/* ── 지연 트리(2026-08-28) ───────────────────────────────── */

/** PDF는 서버 렌더러(W26)가 만든다 — 목업에는 없다. 다이얼로그가 목업에서는 인쇄 버튼을 대신 보여준다. */
export async function downloadPagePdf(): Promise<void> {
  throw new Error("PDF 내보내기는 백엔드 연결에서만 동작합니다 — 브라우저 인쇄를 쓰세요");
}

/** 블로그(W24) — 최신 작성순. 발췌는 백엔드 BlogPostView.excerptOf와 같은 규칙(기호 걷어내고 200자). */
export async function listBlogPosts(spaceId: string): Promise<BlogPost[]> {
  const data = load();
  return data.pages
    .filter((p) => p.spaceId === spaceId && p.type === "blog" && !p.archivedAt && canSeePage(data, p))
    // 같은 밀리초에 만든 글은 생성 순(position)이 시각보다 정확하다 — id는 무작위라 순서가 없다
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.position - a.position)
    .map((p) => ({
      id: p.id, title: p.title, status: p.status, icon: p.icon ?? null,
      createdBy: p.createdBy, updatedBy: p.updatedBy, createdAt: p.createdAt, updatedAt: p.updatedAt,
      excerpt: excerptOf(p.body),
    }));
}

function excerptOf(markdown: string): string {
  const text = markdown
    .replace(/^\s*:{2,}[^\n]*$/gm, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, "")
    .replace(/^\s*[-*+>]\s+/gm, "")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= 200 ? text : `${text.slice(0, 200).trim()}…`;
}

export async function movePage(
  id: string,
  target: {
    parentId: string | null;
    beforeId?: string | null;
    /** 다른 스페이스로 이동(생략 = 현재 스페이스). 백엔드 move 계약과 동일 의미론. */
    spaceId?: string;
    /** 스페이스 간 이동 시 하위 처리 — "with"(기본): 서브트리 동반 / "promote": 원래 부모 밑에 남김 */
    children?: "with" | "promote";
    /** 이동 영향(새로 적용되는 보기 제한) 확인 완료 표시 — 없으면 영향 발견 시 MoveImpactError. */
    confirmImpact?: boolean;
  },
): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === id);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  const targetSpaceId = target.spaceId ?? page.spaceId;
  // W18 이동 영향 — 백엔드와 같은 규칙: 새 조상 체인의 VIEW 제한 중 현 체인에 없던 것
  if (!target.confirmImpact
      && (targetSpaceId !== page.spaceId || page.parentId !== (target.parentId ?? null))) {
    const restrictedChain = (startId: string | null): Map<string, RestrictionPrincipal[]> => {
      const found = new Map<string, RestrictionPrincipal[]>();
      const visited = new Set<string>();
      let cursor = startId;
      while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        const rows = data.restrictions?.[cursor];
        if (rows && rows.view.length > 0) found.set(cursor, rows.view);
        cursor = data.pages.find((p) => p.id === cursor)?.parentId ?? null;
      }
      return found;
    };
    const current = restrictedChain(page.parentId);
    const next = restrictedChain(target.parentId ?? null);
    const newly = [...next.entries()].filter(([pid]) => !current.has(pid));
    if (newly.length > 0) {
      throw new MoveImpactError(
        "이동하면 새 위치의 보기 제한이 적용되어 일부 사용자가 접근을 잃습니다. 확인 후 다시 시도하세요",
        newly.map(([pid, principals]) => ({
          pageId: pid,
          pageTitle: data.pages.find((p) => p.id === pid)?.title ?? "",
          principals: clone(principals),
        })),
      );
    }
  }
  if (targetSpaceId !== page.spaceId) {
    if (!data.spaces.some((s) => s.id === targetSpaceId)) {
      throw new Error("스페이스를 찾을 수 없습니다");
    }
    const sourceParentId = page.parentId;
    if (target.children === "promote") {
      // 직계 하위를 원래 부모 밑으로 올리고 이 페이지만 옮긴다
      for (const child of data.pages) {
        if (child.parentId === page.id) child.parentId = sourceParentId;
      }
    } else {
      // 서브트리 동반 — 구조 유지, spaceId만 변경 (visited: 순환 데이터 방어)
      const queue = [page.id];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const child of data.pages) {
          if (child.parentId === cur) {
            child.spaceId = targetSpaceId;
            queue.push(child.id);
          }
        }
      }
    }
    page.spaceId = targetSpaceId;
  }
  const parentId = target.parentId;
  if (parentId !== null) {
    const parent = data.pages.find((p) => p.id === parentId);
    if (!parent) throw new Error("부모 페이지를 찾을 수 없습니다");
    if (parent.spaceId !== page.spaceId) {
      throw new Error("부모 페이지가 같은 스페이스에 없습니다");
    }
    // 순환 금지: 새 부모에서 루트까지 올라가는 경로에 자신이 있으면 자손 밑 이동이다
    // visited: 손상된 데이터(parentId 순환)에서도 무한 루프하지 않는다 (PageViewPage ancestorsOf와 동일 방어)
    let cursor: Page | undefined = parent;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor.id === page.id) {
        throw new Error("페이지를 자신의 하위로 이동할 수 없습니다");
      }
      if (visited.has(cursor.id)) break;
      visited.add(cursor.id);
      const nextId: string | null = cursor.parentId;
      cursor = nextId === null ? undefined : data.pages.find((p) => p.id === nextId);
    }
  }
  // 대상 형제 집합(자신 제외)에 삽입 위치를 정하고 position을 1..n으로 재부여
  const siblings = data.pages
    .filter((p) => p.spaceId === page.spaceId && p.parentId === parentId && p.id !== page.id)
    .sort((a, b) => a.position - b.position);
  const beforeId = target.beforeId ?? null;
  let insertAt = siblings.length;
  if (beforeId !== null) {
    const index = siblings.findIndex((p) => p.id === beforeId);
    if (index === -1) throw new Error("기준 페이지가 대상 위치에 없습니다");
    insertAt = index;
  }
  siblings.splice(insertAt, 0, page);
  page.parentId = parentId;
  siblings.forEach((p, i) => {
    p.position = i + 1;
  });
  // 이동은 내용 변경이 아니다 — 버전 스냅샷 없음, updatedBy/updatedAt 불변
  persist();
  return clone(page);
}

/**
 * 소유자 지정·해제. 메타데이터라 version·updatedAt·버전 스냅샷을 건드리지 않는다
 * (setPageIcon·movePage와 같은 취급) — 담당자가 바뀌었다고 문서가 고쳐진 것은 아니다.
 */
export async function setPageOwner(pageId: string, ownerId: string | null): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  page.ownerId = ownerId;
  persist();
  return clone(page);
}

/** 검증. until이 없으면 기본 90일(백엔드 PageService.VERIFICATION_DAYS와 같은 값). */
export async function verifyPage(pageId: string, until?: string): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  page.verifiedAt = new Date().toISOString();
  page.verifiedBy = CURRENT_USER_ID;
  page.verifiedUntil = until ?? defaultVerifiedUntil();
  persist();
  return clone(page);
}

export async function unverifyPage(pageId: string): Promise<Page> {
  const data = load();
  const page = data.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("페이지를 찾을 수 없습니다");
  page.verifiedAt = null;
  page.verifiedBy = null;
  page.verifiedUntil = null;
  persist();
  return clone(page);
}
