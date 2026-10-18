// 컨플루언스 DC 이관(M1)(백엔드 어댑터).
import { sharedApiFetch } from "../apiClient";
import {
  type MigrationItemDto,
  type MigrationJobDto,
  type MigrationJobSummaryDto,
  type MigrationReportDto,
  mapMigrationItem,
  mapMigrationJob,
  mapMigrationJobSummary,
  mapMigrationReport,
  toBackendId,
} from "../mapping";
import type {
  MigrationDiscoverResult,
  MigrationItemFilter,
  MigrationItemPage,
  MigrationJob,
  MigrationJobSummary,
  MigrationLinkFixupResult,
  MigrationMode,
  MigrationProvider,
  MigrationReport,
  MigrationSourceInput,
  MigrationSourceProbe,
} from "../types";
import { json } from "./http";

/** 연결 확인(M-01) — 잡을 만들기 전에 주소·키·토큰이 맞는지만 본다. */
export async function probeConfluenceDc(input: MigrationSourceInput): Promise<MigrationSourceProbe> {
  const dto = await json<{ spaceName: string; homepageId?: string | number | null; pageCount?: number | null }>(
    await sharedApiFetch("/api/migration/confluence-dc/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: input.baseUrl.trim(),
        spaceKey: input.spaceKey.trim(),
        token: input.token,
      }),
    }),
  );
  return {
    spaceName: dto.spaceName,
    // DC content id는 숫자로도 문자열로도 온다 — 화면은 표시만 하므로 문자열로 고정한다.
    homepageId: dto.homepageId === null || dto.homepageId === undefined ? null : String(dto.homepageId),
    // 서버가 총 개수를 못 세면 null이다. 0건과 구분해야 한다.
    pageCount: dto.pageCount ?? null,
  };
}

/** 관리자 잡 목록(최신순 50). 403이면 null — 전역 관리자가 아니다(색인 관리와 같은 판정). */
export async function listMigrationJobs(): Promise<MigrationJobSummary[] | null> {
  const res = await sharedApiFetch("/api/migration");
  if (res.status === 403) return null;
  return (await json<MigrationJobSummaryDto[]>(res)).map(mapMigrationJobSummary);
}

export async function createMigrationJob(input: {
  provider: MigrationProvider;
  targetSpaceId: string;
  mode: MigrationMode;
  source?: MigrationSourceInput;
}): Promise<MigrationJob> {
  return mapMigrationJob(
    await json<MigrationJobDto>(
      await sharedApiFetch("/api/migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: input.provider,
          targetSpaceId: toBackendId(input.targetSpaceId),
          mode: input.mode,
          ...(input.source
            ? {
                source: {
                  baseUrl: input.source.baseUrl.trim(),
                  spaceKey: input.source.spaceKey.trim(),
                  token: input.source.token,
                },
              }
            : {}),
        }),
      }),
    ),
  );
}

/** 원본 페이지를 BFS로 enqueue. 재발견은 멱등이라 새 항목만 더한다(sourceKey 유니크). */
export async function discoverMigrationJob(id: string): Promise<MigrationDiscoverResult> {
  const dto = await json<{ discovered?: number; enqueued?: number; skipped?: number }>(
    await sharedApiFetch(`/api/migration/${toBackendId(id)}/discover`, { method: "POST" }),
  );
  return { discovered: dto.discovered ?? 0, enqueued: dto.enqueued ?? 0, skipped: dto.skipped ?? 0 };
}

export async function startMigrationJob(id: string): Promise<MigrationJob> {
  return mapMigrationJob(
    await json<MigrationJobDto>(
      await sharedApiFetch(`/api/migration/${toBackendId(id)}/start`, { method: "POST" }),
    ),
  );
}

export async function cancelMigrationJob(id: string): Promise<MigrationJob> {
  return mapMigrationJob(
    await json<MigrationJobDto>(
      await sharedApiFetch(`/api/migration/${toBackendId(id)}/cancel`, { method: "POST" }),
    ),
  );
}

export async function getMigrationJob(id: string): Promise<MigrationJob> {
  return mapMigrationJob(
    await json<MigrationJobDto>(await sharedApiFetch(`/api/migration/${toBackendId(id)}`)),
  );
}

/**
 * 끝난 잡의 링크 정리만 다시 돌린다 — 문서를 다시 이관하지 않는다. 이미 정리된 문서에는 임시
 * 링크가 남아 있지 않아 손대지 않으므로 **다시 눌러도 안전하고**, 두 번째 실행의 touched가 0인
 * 것이 곧 "고칠 것이 없다"는 뜻이다. COMPLETED·FAILED가 아니면 서버가 409를 준다.
 */
export async function rerunMigrationLinkFixup(id: string): Promise<MigrationLinkFixupResult> {
  const dto = await json<{ touched?: number; failed?: number }>(
    await sharedApiFetch(`/api/migration/${toBackendId(id)}/link-fixup`, { method: "POST" }),
  );
  return { touched: dto.touched ?? 0, failed: dto.failed ?? 0 };
}

export async function getMigrationReport(id: string): Promise<MigrationReport> {
  return mapMigrationReport(
    await json<MigrationReportDto>(await sharedApiFetch(`/api/migration/${toBackendId(id)}/report`)),
  );
}

export async function listMigrationItems(
  id: string,
  filter: MigrationItemFilter = {},
): Promise<MigrationItemPage> {
  const query = new URLSearchParams();
  if (filter.status) query.set("status", filter.status);
  if (filter.stage) query.set("stage", filter.stage);
  if (filter.page) query.set("page", String(filter.page));
  const search = query.toString();
  const suffix = search ? `?${search}` : "";
  const dto = await json<{ items?: MigrationItemDto[]; page?: number; size?: number; total?: number }>(
    await sharedApiFetch(`/api/migration/${toBackendId(id)}/items${suffix}`),
  );
  return {
    items: (dto.items ?? []).map(mapMigrationItem),
    page: dto.page ?? 0,
    size: dto.size ?? 50,
    total: dto.total ?? 0,
  };
}
