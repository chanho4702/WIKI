// 첨부파일 목업(미지원 — 백엔드 연결에서만 동작).
import type { Attachment } from "../types";

export async function listAttachments(_pageId: string): Promise<Attachment[]> {
  return [];
}

export async function uploadAttachment(
  _pageId: string,
  _file: File,
  _options?: import("../types").AttachmentUploadOptions,
): Promise<Attachment> {
  throw new Error("목업 모드에서는 첨부를 지원하지 않습니다");
}

export async function confirmAttachments(_pageId: string, _attachmentIds: string[]): Promise<void> {
  // 목업 모드는 첨부 자체를 지원하지 않는다.
}

export async function listAttachmentVersions(
  _id: string,
): Promise<import("../types").AttachmentVersion[]> {
  return []; // 첨부가 없으니 버전도 없다 — 화면이 빈 목록으로 조용히 접힌다
}

export async function restoreAttachmentVersion(_id: string, _version: number): Promise<Attachment> {
  throw new Error("목업 모드에서는 첨부를 지원하지 않습니다");
}

export function attachmentVersionUrl(id: string, version: number): string {
  return `/api/wiki/attachments/${id}/versions/${version}`;
}

export function attachmentUrl(_id: string): string {
  return "";
}

export function inlineAttachmentUrl(id: string): string {
  return `/api/wiki/attachments/${id}/inline`;
}

export function attachmentIdFromInlineUrl(src: string): string | null {
  return /^\/api\/wiki\/attachments\/(\d+)\/inline$/.exec(src)?.[1] ?? null;
}

export async function fetchInlineAttachment(_id: string, _signal?: AbortSignal): Promise<Blob> {
  throw new Error("목업 모드에서는 첨부를 지원하지 않습니다");
}

export async function deleteAttachment(_id: string): Promise<void> {
  // no-op
}
