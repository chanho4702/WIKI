// 문서 CRUD·이동·복사·게시·메타(아이콘·소유자·검증)·블로그(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { extractError, mapPage, toBackendId, toClientId } from "../mapping";
import {
  type BlogPost,
  type BlogPostPage,
  type CopyPageOptions,
  type DeletePageOptions,
  MoveImpactError,
  type Page,
  PageConflictError,
  type PageStatus,
  type PageType,
  type UpdatePageOptions,
} from "../types";
import { json } from "./http";
import { type RestrictionPrincipalDto, mapPrincipal } from "./restrictions";

export async function setPageOwner(pageId: string, ownerId: string | null): Promise<Page> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/owner`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerId: ownerId === null ? null : toBackendId(ownerId) }),
  });
  return mapPage(await json(res));
}

/** until은 `YYYY-MM-DD`. 없으면 서버가 기본 유효기간(90일)을 붙인다. */
export async function verifyPage(pageId: string, until?: string): Promise<Page> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/verification`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verifiedUntil: until ?? null }),
  });
  return mapPage(await json(res));
}

export async function unverifyPage(pageId: string): Promise<Page> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/verification`, {
    method: "DELETE",
  });
  return mapPage(await json(res));
}

export async function getPage(id: string): Promise<Page | null> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`);
  if (res.status === 404) return null;
  return mapPage(await json(res));
}

/** 폴더(type)·초안(status)은 백엔드 V2가 받는다 — 목업과 같은 의미론이다. */
export async function createPage(input: { spaceId: string; parentId?: string | null; title: string; body?: string; type?: PageType; status?: PageStatus }): Promise<Page> {
  const res = await sharedApiFetch("/api/wiki/pages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spaceId: toBackendId(input.spaceId),
      parentId: input.parentId ? toBackendId(input.parentId) : null,
      title: input.title.trim(), content: input.body ?? "",
      // 백엔드 V2 계약. 미지정이면 서버가 page/published로 채운다(폴더는 항상 published).
      type: input.type, status: input.status,
    }),
  });
  return mapPage(await json(res));
}

export async function updatePage(
  id: string,
  patch: { title?: string; body?: string },
  options: UpdatePageOptions = {},
): Promise<Page> {
  // PUT은 제목·본문·현재 부모·기대 버전을 모두 요구한다. 편집 화면은 넷을 이미 들고 있으므로 그때는
  // 본문 포함 사전 조회를 생략한다(W-19) — 저장 한 번이 왕복 2회·본문 2배 전송이던 것. 결과는 PUT 응답.
  const known = patch.title !== undefined && patch.body !== undefined
    && options.expectedVersion !== undefined && options.parentId !== undefined;
  const current = known
    ? { title: patch.title!, body: patch.body!, parentId: options.parentId!, version: options.expectedVersion! }
    : await getPage(id);
  if (!current) throw new Error("페이지를 찾을 수 없습니다");
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: (patch.title ?? current.title).trim(),
      content: patch.body ?? current.body,
      parentId: current.parentId ? toBackendId(current.parentId) : null,
      // 편집 화면은 load-time version을 넘긴다. 저장 직전 조회한 current.version으로 바꾸면
      // stale 편집도 통과해 다른 사용자의 저장을 조용히 덮어쓴다.
      expectedVersion: options.expectedVersion ?? current.version,
      ...(options.changeNote ? { changeNote: options.changeNote } : {}),
    }),
  });
  if (res.status === 409) {
    const serverPage = await getPage(id).catch(() => null);
    throw new PageConflictError(serverPage);
  }
  if (known && res.status === 400) {
    // 편집하는 사이 다른 사람이 문서를 옮기면(이동은 버전을 올리지 않는다) 들고 있던 부모가 낡아 서버가
    // "부모 변경" 400을 준다. 예전 경로(최신 부모 조회 후 PUT)로 한 번만 다시 보낸다 — 버전 검사는 그대로다.
    const { parentId: _stale, ...rest } = options;
    return updatePage(id, patch, rest);
  }
  return mapPage(await json(res));
}

/* ── 페이지 제한 (W18, V12 계약) ─────────────────────────── */

/**
 * 페이지 PDF 내보내기(W26) — 서버 렌더(flexmark + openhtmltopdf, NanumGothic 임베드).
 * md/html 내보내기와 달리 클라이언트에서 만들 수 없어(폰트·페이지 레이아웃) 파일을 받아 저장한다.
 */
export async function downloadPagePdf(pageId: string, includeChildren: boolean, title: string): Promise<void> {
  const res = await sharedApiFetch(
    `/api/wiki/pages/${toBackendId(pageId)}/export.pdf?includeChildren=${includeChildren}`,
  );
  if (!res.ok) {
    let message = "PDF를 만들지 못했습니다";
    try {
      message = extractError(res.status, await res.json());
    } catch {
      // 본문이 JSON이 아니면 기본 문구
    }
    throw new Error(message);
  }
  const url = URL.createObjectURL(await res.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(title.trim() || "문서").replace(/[\\/:*?"<>|]/g, "_")}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface BlogPostDto {
  id: number; title: string; status: PageStatus; icon: string | null;
  createdBy: number; updatedBy: number; createdAt: string; updatedAt: string; excerpt: string;
}

function mapBlogPost(r: BlogPostDto): BlogPost {
  return {
    id: String(r.id), title: r.title, status: r.status ?? "published", icon: r.icon ?? null,
    createdBy: toClientId(r.createdBy), updatedBy: toClientId(r.updatedBy),
    createdAt: r.createdAt, updatedAt: r.updatedAt, excerpt: r.excerpt ?? "",
  };
}

/** 블로그(W24) — 트리 밖 글 목록 전부, 최신순. 서버가 권한 필터와 발췌를 한다. */
export async function listBlogPosts(spaceId: string): Promise<BlogPost[]> {
  const rows = await json<BlogPostDto[]>(await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/blog`));
  return rows.map(mapBlogPost);
}

/**
 * 블로그 한 쪽(키셋) — `?before=<커서>&limit=1~100`. 본문은 배열 그대로이고 다음 커서는 응답 헤더
 * `X-Next-Before`다. 헤더가 없으면 마지막 쪽이고, **빈 배열이어도 헤더가 있으면 계속**이다(권한 필터로
 * 한 쪽이 통째로 걸러질 수 있다). 커서는 화면에 불투명한 문자열이다.
 */
export async function listBlogPostPage(
  spaceId: string,
  options: { before?: string; limit: number },
): Promise<BlogPostPage> {
  const params = new URLSearchParams();
  if (options.before) params.set("before", options.before);
  params.set("limit", String(options.limit));
  const res = await sharedApiFetch(`/api/wiki/spaces/${toBackendId(spaceId)}/blog?${params.toString()}`);
  const rows = await json<BlogPostDto[]>(res);
  const next = res.headers.get("X-Next-Before");
  return { items: rows.map(mapBlogPost), nextBefore: next && next.trim() !== "" ? next : null };
}

/** 이모지 아이콘 설정/해제 — 메타데이터 변경(버전 스냅샷 없음). 백엔드 V10 계약. */
export async function setPageIcon(id: string, icon: string | null): Promise<Page> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/icon`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ icon }),
  });
  return mapPage(await json(res));
}

/** 조회 1회 기록 — 실패해도 화면을 막으면 안 되는 부가 신호라 호출부에서 무시 가능해야 한다. */
export async function recordPageView(id: string): Promise<number> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/views`, { method: "POST" });
  const body = await json<{ views: number }>(res);
  return body.views;
}

/** 초안 게시(백엔드 V2). 이미 게시됐으면 서버가 멱등 처리하고 같은 문서를 돌려준다. */
export async function publishPage(id: string): Promise<Page> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/publish`, { method: "POST" });
  return mapPage(await json(res));
}

/**
 * 자식 처리는 서버가 한 트랜잭션에서 수행한다(백엔드 V2 `?children=`).
 * 옵션 없이 자식이 있으면 서버가 409 + "하위 페이지가 있어 삭제할 수 없습니다" — 목업과 같은 계약이다.
 */
export async function deletePage(id: string, options?: DeletePageOptions): Promise<void> {
  const query = options?.children ? `?children=${options.children}` : "";
  await json(await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}${query}`, { method: "DELETE" }));
}

/* ── 지연 트리(2026-08-28) ─────────────────── */

/** 페이지 복제 — 서버가 첨부 복사·본문 참조 재작성·하위 계층까지 한다. */
export async function copyPage(id: string, options?: CopyPageOptions): Promise<Page> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      includeDescendants: options?.includeDescendants ?? false,
      includeRestrictions: options?.includeRestrictions ?? true,
      // 대상 위치(F-03) — 주지 않으면 키 자체를 빼서 예전처럼 원본 옆에 만든다
      ...(options?.targetSpaceId ? { targetSpaceId: toBackendId(options.targetSpaceId) } : {}),
      ...(options?.targetParentId ? { targetParentId: toBackendId(options.targetParentId) } : {}),
    }),
  });
  return mapPage(await json(res));
}

/* ── 페이지 템플릿(W23) ──────────────────────────────────── */

export async function movePage(
  id: string,
  target: {
    parentId: string | null;
    beforeId?: string | null;
    spaceId?: string;
    children?: "with" | "promote";
    confirmImpact?: boolean;
  },
): Promise<Page> {
  // V9 전용 move — 부모와 형제 순서를 한 트랜잭션으로. 이동은 편집이 아니라 version 불변이며,
  // 예전 PUT 경유(조회→전체 갱신)의 버전 증가·경합 문제가 함께 사라졌다(P1-001).
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(id)}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parentId: target.parentId ? toBackendId(target.parentId) : null,
      beforeId: target.beforeId ? toBackendId(target.beforeId) : null,
      spaceId: target.spaceId ? toBackendId(target.spaceId) : null,
      children: target.children ?? null,
      confirmImpact: target.confirmImpact ?? false,
    }),
  });
  // W18 이동 영향 — 409에 impact가 실리면 확인 다이얼로그 분기용 오류로 변환
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      impact?: { newlyRestrictedBy?: Array<{ pageId: number; pageTitle: string; principals: RestrictionPrincipalDto[] }> };
    } | null;
    if (body?.impact?.newlyRestrictedBy) {
      throw new MoveImpactError(
        body.error ?? "이동 영향 확인이 필요합니다",
        body.impact.newlyRestrictedBy.map((i) => ({
          pageId: String(i.pageId),
          pageTitle: i.pageTitle,
          principals: i.principals.map(mapPrincipal),
        })),
      );
    }
    throw new Error(body?.error ?? "이동 충돌이 발생했습니다");
  }
  return mapPage(await json(res));
}
