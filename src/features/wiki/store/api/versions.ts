// 버전 이력·복원(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import { mapPage, mapVersionFull, mapVersionMeta, toBackendId } from "../mapping";
import type { Page, PageVersion, VersionPage } from "../types";
import { json } from "./http";

/** 이력 한 쪽(최신순, 버전 번호 커서) — 버전이 수백 개인 문서도 첫 화면은 한 쪽만 읽는다. */
export async function listVersionPage(
  pageId: string,
  options: { before?: number | null; limit?: number } = {},
): Promise<VersionPage> {
  const params = new URLSearchParams();
  if (options.before != null) params.set("before", String(options.before));
  if (options.limit != null) params.set("limit", String(options.limit));
  const query = params.toString();
  const dto = await json<{
    items: Parameters<typeof mapVersionMeta>[0][];
    nextBefore: number | null;
    total: number;
  }>(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/revisions/paged${query ? `?${query}` : ""}`));
  return {
    versions: dto.items.map((m) => mapVersionMeta(m, pageId)),
    nextBefore: dto.nextBefore ?? null,
    total: dto.total,
  };
}

/** 버전 번호로 본문까지 — 주소의 `v. 5`를 목록 없이 바로 연다(목록 첫 쪽 밖이어도). 없으면 null. */
export async function getVersionByNumber(pageId: string, version: number): Promise<PageVersion | null> {
  const res = await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/revisions/${version}`);
  if (res.status === 404) return null;
  return mapVersionFull(await json<Parameters<typeof mapVersionFull>[0]>(res), pageId);
}

export async function listVersions(pageId: string): Promise<PageVersion[]> {
  const metas = await json<Parameters<typeof mapVersionMeta>[0][]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/revisions`),
  );
  return metas.map((m) => mapVersionMeta(m, pageId)); // 백엔드가 최신순 보장
}

/**
 * 한 버전의 본문까지 읽는다. 목록(listVersions)은 메타만 주므로 미리보기·비교는 이걸 쓴다 —
 * 이력이 수십 개인 문서의 본문을 목록 한 번에 전부 실어 보낼 이유가 없다.
 */
export async function getVersion(pageId: string, versionId: string): Promise<PageVersion> {
  const version = Number(versionId.split(":")[1]);
  const dto = await json<Parameters<typeof mapVersionFull>[0]>(
    await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/revisions/${version}`),
  );
  return mapVersionFull(dto, pageId);
}

export async function restoreVersion(
  pageId: string,
  versionId: string,
  changeNote?: string,
): Promise<Page> {
  // versionId는 어댑터가 만든 `${pageId}:${version}` — 버전 번호를 추출해 restore 엔드포인트 호출.
  const version = Number(versionId.split(":")[1]);
  // 변경 요약은 있을 때만 실어 보낸다. 백엔드(RevisionController.restore)는 **아직 본문을 읽지
  // 않아** 서버가 만든 버전에는 자기 문구가 남는다 — 계약 문서의 후속 항목이다.
  const res = await sharedApiFetch(
    `/api/wiki/pages/${toBackendId(pageId)}/revisions/${version}/restore`,
    changeNote === undefined
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changeNote }),
        },
  );
  return mapPage(await json(res));
}
