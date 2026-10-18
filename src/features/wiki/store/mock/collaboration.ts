// 공동 편집 목업 — 목업에는 협업 서버가 없다.
import type { CollaborationDraftCommit, CollaborationDraftCommitOptions } from "../types";
import { updatePage } from "./pages";

export async function commitCollaborationDraft(
  id: string,
  patch: { title: string; body: string },
  options: CollaborationDraftCommitOptions,
): Promise<CollaborationDraftCommit> {
  return {
    page: await updatePage(id, patch, { expectedVersion: options.expectedVersion }),
    generation: options.expectedGeneration + 1,
  };
}

export async function requestCollaborationTicket(
  _pageId: string,
): Promise<import("../types").CollaborationTicket> {
  throw new Error("목업 모드에서는 공동 편집을 지원하지 않습니다");
}

export async function bootstrapCollaborationDocument(
  _pageId: string,
  _basePageVersion: number,
  _ticket: string,
  _state: Uint8Array,
): Promise<import("../types").CollaborationBootstrap> {
  throw new Error("목업 모드에서는 공동 편집을 지원하지 않습니다");
}
