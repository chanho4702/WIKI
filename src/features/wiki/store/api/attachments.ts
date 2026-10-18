// 첨부파일(백엔드 어댑터).
import { resolveApiPath, sharedApiFetch, sharedApiUpload } from "../apiClient";
import { extractError, toBackendId } from "../mapping";
import type { Attachment, AttachmentUploadOptions, AttachmentVersion } from "../types";
import { json } from "./http";

interface AttDto {
  id: number;
  pageId?: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  version?: number;
}

function mapAtt(d: AttDto, pageId: string): Attachment {
  return {
    id: String(d.id),
    pageId,
    filename: d.filename,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    checksumSha256: d.checksumSha256,
    version: d.version,
  };
}

export async function listAttachments(pageId: string): Promise<Attachment[]> {
  const dtos = await json<AttDto[]>(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/attachments`));
  return dtos.map((d) => mapAtt(d, pageId));
}

export async function uploadAttachment(
  pageId: string,
  file: File,
  options: AttachmentUploadOptions = {},
): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);
  const path = `/api/wiki/pages/${toBackendId(pageId)}/attachments${options.pending ? "?pending=true" : ""}`;
  // 진행률/취소가 필요한 에디터 경로는 XHR, 일반 첨부는 기존 fetch 경로를 유지한다.
  // 둘 다 Content-Type을 직접 지정하지 않아 브라우저가 multipart boundary를 채운다.
  const res = options.onProgress || options.signal
    ? await sharedApiUpload(path, form, options)
    : await sharedApiFetch(path, { method: "POST", body: form });
  return mapAtt(await json(res), pageId);
}

export async function confirmAttachments(pageId: string, attachmentIds: string[]): Promise<void> {
  if (!attachmentIds.length) return;
  await json(await sharedApiFetch(`/api/wiki/pages/${toBackendId(pageId)}/attachments/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachmentIds: attachmentIds.map(toBackendId) }),
  }));
}

export async function listAttachmentVersions(id: string): Promise<AttachmentVersion[]> {
  const rows = await json<Array<{
    version: number;
    contentType: string;
    sizeBytes: number;
    uploadedBy: number | string;
    createdAt: string | null;
  }>>(await sharedApiFetch(`/api/wiki/attachments/${toBackendId(id)}/versions`));
  return rows.map((r) => ({ ...r, uploadedBy: String(r.uploadedBy) }));
}

export async function restoreAttachmentVersion(id: string, version: number): Promise<Attachment> {
  const res = await sharedApiFetch(
    `/api/wiki/attachments/${toBackendId(id)}/versions/${version}/restore`, { method: "POST" });
  const dto = await json<AttDto>(res);
  return mapAtt(dto, String(dto.pageId));
}

/** 지난 버전 내려받기 — 인증이 필요한 경로라 화면이 fetch로 받아 저장한다. */
export function attachmentVersionUrl(id: string, version: number): string {
  // 브라우저가 직접 여는 주소다 — 인스턴스별 접두사(공개 문서=/api/docs)를 fetch 경로와 같게 맞춘다.
  return `${import.meta.env.VITE_API_BASE ?? ""}${resolveApiPath(`/api/wiki/attachments/${toBackendId(id)}/versions/${version}`)}`;
}

/* ── 별표·최근 방문(W23) ─────────────────────────────────── */

export function attachmentUrl(id: string): string {
  return `${import.meta.env.VITE_API_BASE ?? ""}${resolveApiPath(`/api/wiki/attachments/${toBackendId(id)}`)}`;
}

/**
 * 본문에 저장하는 durable 내부 참조. 절대 host·presigned URL을 저장하지 않는다.
 * 인스턴스별 접두사도 **적용하지 않는다** — 본문에 박히는 값이라 배포 경로가 바뀌면 과거 문서가
 * 전부 깨진다. 실제 요청은 fetchInlineAttachment가 apiClient를 거치며 접두사를 붙인다.
 */
export function inlineAttachmentUrl(id: string): string {
  return `/api/wiki/attachments/${toBackendId(id)}/inline`;
}

export function attachmentIdFromInlineUrl(src: string): string | null {
  return /^\/api\/wiki\/attachments\/(\d+)\/inline$/.exec(src)?.[1] ?? null;
}

/** 메모리 AT를 붙여 받은 뒤 화면이 Blob URL로 변환한다. `<img src>` 직접 호출은 인증되지 않는다. */
export async function fetchInlineAttachment(id: string, signal?: AbortSignal): Promise<Blob> {
  const res = await sharedApiFetch(`/api/wiki/attachments/${toBackendId(id)}/inline`, { signal });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new Error(extractError(res.status, body));
  }
  return res.blob();
}

export async function deleteAttachment(id: string): Promise<void> {
  await json(await sharedApiFetch(`/api/wiki/attachments/${toBackendId(id)}`, { method: "DELETE" }));
}
