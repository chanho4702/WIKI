// src/features/wiki/store/wikiStore.ts
// 듀얼모드 진입점 — 프로덕션 또는 API 환경변수가 있으면 백엔드 어댑터, 순수 dev/test는 목업.
// 공개 함수 시그니처·의미론은 store/CLAUDE.md 계약 그대로. 화면·테스트는 이 모듈만 import한다.
import * as mock from "./wikiMock";
import * as api from "./wikiApi";
import { USE_BACKEND } from "./apiClient";

const impl = USE_BACKEND ? api : mock;

export const listUsers = impl.listUsers;
export const getCurrentUser = impl.getCurrentUser;
export const requestCollaborationTicket = impl.requestCollaborationTicket;
export const bootstrapCollaborationDocument = impl.bootstrapCollaborationDocument;
export const listSpaces = impl.listSpaces;
export const createSpace = impl.createSpace;
export const listPages = impl.listPages;
export const getPage = impl.getPage;
export const createPage = impl.createPage;
export const updatePage = impl.updatePage;
export const setPageIcon = impl.setPageIcon;
export const recordPageView = impl.recordPageView;
export const listNotifications = impl.listNotifications;
export const markNotificationsRead = impl.markNotificationsRead;
export const getPageRestrictions = impl.getPageRestrictions;
export const setPageRestrictions = impl.setPageRestrictions;
export const listTeams = impl.listTeams;
export const commitCollaborationDraft = impl.commitCollaborationDraft;
export const publishPage = impl.publishPage;
export const deletePage = impl.deletePage;
export const movePage = impl.movePage;
export const copyPage = impl.copyPage;
export const listVersions = impl.listVersions;
export const restoreVersion = impl.restoreVersion;
export const listComments = impl.listComments;
export const addComment = impl.addComment;
export const updateComment = impl.updateComment;
export const deleteComment = impl.deleteComment;
export const listAttachments = impl.listAttachments;
export const uploadAttachment = impl.uploadAttachment;
export const confirmAttachments = impl.confirmAttachments;
export const attachmentUrl = impl.attachmentUrl;
export const inlineAttachmentUrl = impl.inlineAttachmentUrl;
export const attachmentIdFromInlineUrl = impl.attachmentIdFromInlineUrl;
export const fetchInlineAttachment = impl.fetchInlineAttachment;
export const deleteAttachment = impl.deleteAttachment;
export const searchContent = impl.searchContent;

// 테스트 전용 — 항상 목업 캐시를 초기화(백엔드 모드에선 테스트를 돌리지 않음).
export const __resetForTest = mock.__resetForTest;
