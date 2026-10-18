// src/features/wiki/store/wikiMock.ts
// 듀얼모드 목업 백엔드 — localStorage(wiki.v1) 기반. 순수 dev/test(백엔드 환경변수 없음)에서 wikiStore가
// 이 모듈을 쓴다. 구현은 도메인별 `mock/*.ts`에 있고 이 파일은 다시 내보내기만 한다. 프로덕션 빌드는
// USE_BACKEND가 상수 true라 wikiStore의 분기가 접혀 이 모듈 전체가 번들에서 빠진다.

export { __resetForTest } from "./mock/db";
export {
  listUsers,
  listSelectableUsers,
  getCurrentUser,
  getOrgMe,
  searchUsers,
  orgApiFetch,
  listTeams,
  createTeam,
  deleteTeam,
  listTeamMembers,
  addTeamMember,
  removeTeamMember,
} from "./mock/org";
export {
  listSpaces,
  setSpaceLabels,
  ensurePersonalSpace,
  createSpace,
  updateSpace,
  deleteSpace,
  listSpaceGrants,
  addSpaceGrant,
  removeSpaceGrant,
} from "./mock/spaces";
export {
  getPage,
  createPage,
  updatePage,
  setPageIcon,
  recordPageView,
  publishPage,
  copyPage,
  deletePage,
  downloadPagePdf,
  listBlogPosts,
  movePage,
  setPageOwner,
  verifyPage,
  unverifyPage,
} from "./mock/pages";
export {
  listVersions,
  listVersionPage,
  getVersionByNumber,
  getVersion,
  restoreVersion,
} from "./mock/versions";
export {
  listChildren,
  listAncestors,
  listDescendants,
  lookupPagesByTitle,
  listRecentlyUpdated,
  listPagesByIds,
  searchPageTitles,
  listPagePaths,
} from "./mock/tree";
export {
  listCommentThreads,
  listComments,
  addComment,
  setCommentResolved,
  updateComment,
  deleteComment,
} from "./mock/comments";
export {
  sharePage,
  listNotifications,
  getNotificationPrefs,
  updateNotificationPrefs,
  markNotificationsRead,
  getWatchState,
  setWatchState,
  getSpaceWatchState,
  setSpaceWatchState,
} from "./mock/notifications";
export {
  commitCollaborationDraft,
  requestCollaborationTicket,
  bootstrapCollaborationDocument,
} from "./mock/collaboration";
export { getPageRestrictions, setPageRestrictions } from "./mock/restrictions";
export {
  normalizeLabel,
  listLabels,
  setLabels,
  suggestLabels,
  listSpaceLabels,
  listPagesWithLabel,
  listBacklinks,
  extractLinkTargets,
} from "./mock/labels";
export {
  listArchive,
  archivePage,
  unarchivePage,
  listTrash,
  restorePage,
  purgePage,
  emptyTrash,
} from "./mock/trash";
export {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  savePageAsTemplate,
} from "./mock/templates";
export {
  listAttachments,
  uploadAttachment,
  confirmAttachments,
  listAttachmentVersions,
  restoreAttachmentVersion,
  attachmentVersionUrl,
  attachmentUrl,
  inlineAttachmentUrl,
  attachmentIdFromInlineUrl,
  fetchInlineAttachment,
  deleteAttachment,
} from "./mock/attachments";
export {
  listMyTasks,
  setTaskDone,
  listPageReactions,
  setPageReaction,
  setCommentReaction,
  listStars,
  setPageStar,
  setSpaceStar,
  listRecentPages,
  listMyDrafts,
} from "./mock/personal";
export {
  listSpaceDeletions,
  listAudit,
  listGrantAudit,
  getSearchIndexStatus,
  startReindex,
  getReindexJob,
} from "./mock/admin";
export { searchContent } from "./mock/search";
export {
  probeConfluenceDc,
  listMigrationJobs,
  createMigrationJob,
  discoverMigrationJob,
  startMigrationJob,
  cancelMigrationJob,
  getMigrationJob,
  rerunMigrationLinkFixup,
  getMigrationReport,
  listMigrationItems,
} from "./mock/migrations";
