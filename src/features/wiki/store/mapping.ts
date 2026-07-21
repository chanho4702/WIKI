// 백엔드(wiki-backend) DTO ↔ 프론트 도메인 타입 순수 변환. 부수효과 없음.
import type { Page, PageVersion, Space } from "./types";

export function toClientId(n: number): string {
  return String(n);
}
export function toBackendId(s: string): number {
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error(`잘못된 백엔드 id: ${s}`);
  return n;
}

interface SpaceDto { id: number; key: string; name: string; description?: string | null }
export function mapSpace(dto: SpaceDto): Space {
  return {
    id: toClientId(dto.id),
    key: dto.key,
    name: dto.name,
    description: dto.description ?? undefined,
    // 백엔드 SpaceResponse엔 createdAt이 없다 → 빈 문자열. ⚠️ 백엔드 모드에서 화면이 이 값을
    // new Date("")로 포맷하면 "Invalid Date"가 노출된다 — 디렉토리 생성일 "-" 폴백은 후속 화면 배선 필요
    // (설계 §7 backend-mode 알려진 한계). 목업 모드는 실제 createdAt이 있어 무관.
    createdAt: "",
  };
}

interface PageDto { id: number; spaceId: number; parentId: number | null; title: string; content: string; version: number }
export function mapPage(dto: PageDto): Page {
  // 백엔드 PageResponse엔 시각/작성자가 없다 → 빈 문자열. ⚠️ 백엔드 모드에서 PageView 메타의
  // "N이 수정"(작성자)·수정일(new Date("")→"Invalid Date")과 HistoryModal의 no-op 판정
  // (restored.updatedAt === page.updatedAt, 둘 다 "" → 항상 "변경 없음")이 어긋난다 — 화면 폴백 배선은
  // 후속(설계 §7 backend-mode 알려진 한계). 목업 모드는 실제 값이 있어 무관.
  const now = "";
  return {
    id: toClientId(dto.id),
    spaceId: toClientId(dto.spaceId),
    parentId: dto.parentId === null ? null : toClientId(dto.parentId),
    title: dto.title,
    body: dto.content,
    version: dto.version,
    position: 0,
    createdBy: "", updatedBy: "", createdAt: now, updatedAt: now,
  };
}

interface TreeItemDto { id: number; parentId: number | null; title: string }
export function mapPageTree(items: TreeItemDto[]): Page[] {
  // 백엔드 트리엔 position/본문/시각이 없다. index+1을 position으로 부여(형제 순서는 서버 미보장 — 설계 §4-3).
  return items.map((it, i) => ({
    id: toClientId(it.id),
    spaceId: "",
    parentId: it.parentId === null ? null : toClientId(it.parentId),
    title: it.title,
    body: "",
    version: 1,
    position: i + 1,
    createdBy: "", updatedBy: "", createdAt: "", updatedAt: "",
  }));
}

interface RevMetaDto { version: number; editedBy: number; createdAt: string }
export function mapVersionMeta(dto: RevMetaDto, pageId: string): PageVersion {
  return {
    id: `${pageId}:${dto.version}`, pageId, version: dto.version,
    title: "", body: "",
    savedBy: toClientId(dto.editedBy), savedAt: dto.createdAt,
  };
}
interface RevFullDto { version: number; title: string; content: string; editedBy: number }
export function mapVersionFull(dto: RevFullDto, pageId: string, savedAt = ""): PageVersion {
  return {
    id: `${pageId}:${dto.version}`, pageId, version: dto.version,
    title: dto.title, body: dto.content,
    savedBy: toClientId(dto.editedBy), savedAt,
  };
}

export function extractError(status: number, body: unknown): string {
  const msg = (body as { error?: string } | null)?.error;
  if (typeof msg === "string" && msg) return msg;
  if (status === 409) return "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.";
  if (status === 403) return "권한이 없습니다.";
  if (status === 404) return "찾을 수 없습니다.";
  return `요청 실패(${status})`;
}
