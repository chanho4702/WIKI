// src/features/wiki/store/platformApi.ts
// 플랫폼 설치 옵션(런타임 기능 플래그) — 게이트웨이가 소유하는 `GET /api/platform/features`.
import { READ_ONLY } from "../lib/readOnly";
import { USE_BACKEND, sharedApiFetch } from "./apiClient";

/**
 * 통합 검색 설치 옵션(`SEARCH_MODE`, 설계 2026-09-12).
 *
 * - `lite`: 위키 자체 검색(wiki-backend + Postgres `pg_trgm`). 추가 컨테이너가 없고 재색인 개념도 없다.
 * - `opensearch`: search-service + OpenSearch(Nori). 형태소 분석·재색인·통합(cross-app) 검색.
 * - `external`: 고객사가 이미 굴리는 OpenSearch/ES 클러스터에 붙는다. 능력은 `opensearch`와 같다.
 */
export type SearchMode = "lite" | "opensearch" | "external";

export interface SearchFeatures {
  mode: SearchMode;
  /** cross-app(위키+ALM) 검색이 가능한가 — `opensearch` 모드 전용 능력이다. */
  unified: boolean;
  /** 색인 재생성 API(`/api/search/admin/reindex`)가 있는가. 라이트에는 색인 자체가 없다. */
  reindex: boolean;
}

export interface PlatformFeatures {
  search: SearchFeatures;
}

/**
 * **모르면 라이트다.** 404(구버전 게이트웨이)·401·네트워크 실패·공개 문서 인스턴스가 모두 여기로
 * 접힌다 — 설계의 핵심이다. 반대로 접으면(모르면 풀스택) 꺼진 설치에서 죽은 관리 메뉴가 살아난다.
 */
export const LITE_FEATURES: PlatformFeatures = Object.freeze({
  search: Object.freeze({ mode: "lite", unified: false, reindex: false }),
}) as PlatformFeatures;

/**
 * 목업 모드 기본값은 `opensearch`다 — 목업/dev는 "현재 화면 그대로"가 기준이고, 관리 메뉴를
 * 열어 볼 수 없으면 그 화면을 개발할 수 없다. 라이트 화면은 테스트가 아래 키로 주입한다.
 */
export const MOCK_FEATURES: PlatformFeatures = Object.freeze({
  search: Object.freeze({ mode: "opensearch", unified: true, reindex: true }),
}) as PlatformFeatures;

/** 목업 모드 전용 주입 통로(테스트·수동 확인). 백엔드 모드는 이 키를 읽지 않는다. */
export const MOCK_FEATURES_KEY = "platform.features.v1";

function parseMode(raw: unknown): SearchMode {
  // 모르는 값은 라이트다 — 새 모드를 아는 게이트웨이 + 모르는 프론트 조합에서 능력을 앞질러 켜지 않는다.
  return raw === "opensearch" || raw === "external" ? raw : "lite";
}

/**
 * 서버 응답을 화면이 믿을 수 있는 모양으로 좁힌다. 필드가 없으면 모드에서 파생한다 —
 * 게이트웨이가 `mode`만 주는 버전이어도 화면이 undefined를 truthy로 읽지 않게.
 */
export function normalizeFeatures(raw: unknown): PlatformFeatures {
  const search = (raw as { search?: Record<string, unknown> } | null | undefined)?.search;
  const mode = parseMode(search?.mode);
  const flag = (value: unknown) => (typeof value === "boolean" ? value : mode !== "lite");
  return { search: { mode, unified: flag(search?.unified), reindex: flag(search?.reindex) } };
}

/**
 * 백엔드 모드의 실제 조회. **실패를 던지지 않는다** — 기능 플래그를 못 읽는 것이 화면을 죽일
 * 이유는 아니고, 못 읽었을 때의 정답이 라이트로 이미 정해져 있다.
 */
export async function fetchPlatformFeatures(): Promise<PlatformFeatures> {
  try {
    const res = await sharedApiFetch("/api/platform/features");
    if (!res.ok) return LITE_FEATURES;
    return normalizeFeatures(await res.json());
  } catch {
    return LITE_FEATURES;
  }
}

function mockPlatformFeatures(): PlatformFeatures {
  try {
    const raw = localStorage.getItem(MOCK_FEATURES_KEY);
    return raw ? normalizeFeatures(JSON.parse(raw)) : MOCK_FEATURES;
  } catch {
    return MOCK_FEATURES;
  }
}

let cached: Promise<PlatformFeatures> | null = null;

/**
 * 설치 옵션 조회 — **세션 1회**만 실제로 묻는다(상단바·검색 화면·색인 관리가 같은 답을 본다).
 * 설치 옵션은 배포 중에 바뀌지 않으므로 다시 물을 이유가 없다. 실패도 캐시된다(라이트 폴백).
 */
export function getPlatformFeatures(): Promise<PlatformFeatures> {
  // 공개 문서 인스턴스는 nginx가 자기 백엔드로 직접 프록시해 게이트웨이를 거치지 않는다 —
  // 물어봐야 401/404 잡음만 남고 답은 어차피 라이트다(그 인스턴스에는 관리 메뉴가 없다).
  if (READ_ONLY) return Promise.resolve(LITE_FEATURES);
  cached ??= USE_BACKEND ? fetchPlatformFeatures() : Promise.resolve(mockPlatformFeatures());
  return cached;
}

/** 테스트 전용 — 세션 캐시를 비운다(주입한 값이 다음 조회에 반영되도록). */
export function __resetPlatformFeaturesForTest(): void {
  cached = null;
}
