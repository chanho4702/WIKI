// 백엔드(wiki-backend) DTO ↔ 프론트 도메인 타입 순수 변환. 부수효과 없음.
import type { Comment, Page, PageNode, PageStatus, PageType, PageVersion, Space } from "./types";

export function toClientId(n: number): string {
  return String(n);
}
export function toBackendId(s: string): number {
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error(`잘못된 백엔드 id: ${s}`);
  return n;
}

interface SpaceDto { id: number; key: string; name: string; description?: string | null; ownerId?: number | string | null }
export function mapSpace(dto: SpaceDto): Space {
  return {
    id: toClientId(dto.id),
    key: dto.key,
    name: dto.name,
    description: dto.description ?? undefined,
    ownerId: dto.ownerId === null || dto.ownerId === undefined ? null : String(dto.ownerId),
    // 백엔드 SpaceResponse엔 createdAt이 없다 → 빈 문자열. ⚠️ 백엔드 모드에서 화면이 이 값을
    // new Date("")로 포맷하면 "Invalid Date"가 노출된다 — 디렉토리 생성일 "-" 폴백은 후속 화면 배선 필요
    // (설계 §7 backend-mode 알려진 한계). 목업 모드는 실제 createdAt이 있어 무관.
    createdAt: "",
  };
}

export interface PageDto {
  /** 보관 시각(W23) — 구버전 응답에는 없다. */
  archivedAt?: string | null;
  id: number; spaceId: number; parentId: number | null; title: string; content: string; version: number;
  /** V9 형제 순서 — 구버전 응답 호환을 위해 optional */
  position?: number;
  /** 백엔드 V2에서 추가. 없던 시절 응답 호환을 위해 optional로 둔다. */
  type?: PageType; status?: PageStatus;
  /** V10 — 이모지 아이콘·조회수. 구버전 응답 호환 optional. */
  icon?: string | null; views?: number;
}
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
    // 백엔드 V2(page.type/status)가 주는 값을 그대로 쓴다. 필드가 없는 구버전 응답은
    // 도입 이전 기본값(page/published)으로 읽는다.
    type: dto.type ?? "page",
    status: dto.status ?? "published",
    title: dto.title,
    body: dto.content,
    version: dto.version,
    icon: dto.icon ?? null,
    views: dto.views,
    position: dto.position ?? 0,
    createdBy: "", updatedBy: "", createdAt: now, updatedAt: now,
    archivedAt: dto.archivedAt ?? null,
  };
}

export interface TreeItemDto { id: number; parentId: number | null; title: string; type?: PageType; status?: PageStatus   /** V9 형제 순서 — 구버전 응답 호환을 위해 optional */
  position?: number;
  /** V10 — 트리에 이모지 아이콘 표시용. */
  icon?: string | null;
  /** 2026-08-29 — 폴더 화면의 "마지막 편집" 열. 구버전 응답 호환을 위해 optional. */
  updatedBy?: number | null;
  updatedAt?: string | null;
}
export function mapPageTree(items: TreeItemDto[]): Page[] {
  // V9부터 서버가 형제 순서(position)를 저장한다(P1-001). 없던 시절 응답은 index+1 폴백.
  return items.map((it, i) => ({
    id: toClientId(it.id),
    spaceId: "",
    parentId: it.parentId === null ? null : toClientId(it.parentId),
    type: it.type ?? "page",
    status: it.status ?? "published",
    title: it.title,
    icon: it.icon ?? null,
    body: "",
    version: 1,
    position: it.position ?? i + 1,
    createdBy: "", updatedBy: "", createdAt: "", updatedAt: "",
  }));
}

interface RevMetaDto {
  version: number;
  editedBy: number;
  createdAt: string;
  /** 변경 요약(V17) — 선택 입력이라 대개 없다. */
  changeNote?: string | null;
}
export function mapVersionMeta(dto: RevMetaDto, pageId: string): PageVersion {
  return {
    id: `${pageId}:${dto.version}`, pageId, version: dto.version,
    title: "", body: "",
    savedBy: toClientId(dto.editedBy), savedAt: dto.createdAt,
    changeNote: dto.changeNote ?? undefined,
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

export interface CommentDto {
  id: number;
  pageId: number;
  parentId: number | null;
  authorId: number;
  authorName: string;
  body: string;
  createdAt: string;
  /** 서버의 editedAt — 수정된 적 없으면 null(프론트 "(수정됨)" 표시 근거). */
  updatedAt: string | null;
  /** W21-4 인라인 댓글 — 구버전 응답 호환을 위해 optional. */
  anchorType?: string;
  anchorQuote?: string | null;
  anchorOccurrence?: number | null;
  resolvedAt?: string | null;
  reactions?: Array<{ emoji: string; count: number; reacted: boolean }>;
}

/** 지연 트리 노드 DTO — PageTreeItem + childCount(2026-08-28). */
export interface PageNodeDto extends TreeItemDto {
  childCount: number;
}

export function mapPageNode(dto: PageNodeDto): PageNode {
  return {
    id: toClientId(dto.id),
    parentId: dto.parentId === null || dto.parentId === undefined ? null : toClientId(dto.parentId),
    title: dto.title,
    type: dto.type ?? "page",
    status: dto.status ?? "published",
    position: dto.position ?? 0,
    icon: dto.icon ?? null,
    updatedBy: dto.updatedBy === null || dto.updatedBy === undefined ? undefined : toClientId(dto.updatedBy),
    updatedAt: dto.updatedAt ?? undefined,
    childCount: dto.childCount ?? 0,
  };
}

export function mapComment(dto: CommentDto): Comment {
  return {
    id: toClientId(dto.id),
    pageId: toClientId(dto.pageId),
    parentId: dto.parentId === null || dto.parentId === undefined ? null : toClientId(dto.parentId),
    authorId: toClientId(dto.authorId),
    authorName: dto.authorName,
    body: dto.body,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt ?? null,
    anchorType: dto.anchorType === "inline" ? "inline" : "page",
    anchorQuote: dto.anchorQuote ?? null,
    anchorOccurrence: dto.anchorOccurrence ?? null,
    resolvedAt: dto.resolvedAt ?? null,
    reactions: dto.reactions ?? [],
  };
}
