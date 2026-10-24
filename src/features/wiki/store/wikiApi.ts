// src/features/wiki/store/wikiApi.ts
// wiki-backend 어댑터(백엔드 모드) — 구현은 도메인별 `api/*.ts`에 있고 이 파일은 다시 내보내기만 한다.
// 공개 함수 시그니처·의미론은 목업(wikiMock)과 같다(store/CLAUDE.md). 목업에 의존하지 않는다 —
// 프로덕션 번들에 목업이 섞이지 않게 하는 경계다.

export {
  getCurrentUser,
  __resetUserDirectoryForTest,
  listUsers,
  listSelectableUsers,
  getOrgMe,
  searchUsers,
  getPersonProfile,
  orgApiFetch,
  displayUserName,
  listTeams,
  createTeam,
  deleteTeam,
  listTeamMembers,
  addTeamMember,
  removeTeamMember,
} from "./api/org";
export {
  listSpaces,
  createSpace,
  listSpaceGrants,
  addSpaceGrant,
  removeSpaceGrant,
  updateSpace,
  setSpaceLabels,
  deleteSpace,
  ensurePersonalSpace,
} from "./api/spaces";
export {
  setPageOwner,
  verifyPage,
  unverifyPage,
  getPage,
  createPage,
  updatePage,
  downloadPagePdf,
  listBlogPosts,
  listBlogPostPage,
  setPageIcon,
  recordPageView,
  publishPage,
  deletePage,
  copyPage,
  movePage,
} from "./api/pages";
export {
  listChildren,
  listAncestors,
  listDescendants,
  lookupPagesByTitle,
  listRecentlyUpdated,
  listPagesByIds,
  searchPageTitles,
  listPagePaths,
} from "./api/tree";
export {
  listVersionPage,
  getVersionByNumber,
  listVersions,
  getVersion,
  restoreVersion,
} from "./api/versions";
export {
  listComments,
  listCommentThreads,
  addComment,
  setCommentResolved,
  updateComment,
  deleteComment,
} from "./api/comments";
export {
  getWatchState,
  setWatchState,
  getSpaceWatchState,
  listWatches,
  unwatchMany,
  setSpaceWatchState,
  getNotificationPrefs,
  updateNotificationPrefs,
  listNotifications,
  markNotificationsRead,
  sharePage,
} from "./api/notifications";
export {
  commitCollaborationDraft,
  requestCollaborationTicket,
  bootstrapCollaborationDocument,
} from "./api/collaboration";
export { getPageRestrictions, setPageRestrictions } from "./api/restrictions";
export {
  listLabels,
  setLabels,
  suggestLabels,
  listSpaceLabels,
  listPagesWithLabel,
  listBacklinks,
} from "./api/labels";
export {
  listArchive,
  archivePage,
  unarchivePage,
  listTrash,
  restorePage,
  purgePage,
  emptyTrash,
} from "./api/trash";
export {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  savePageAsTemplate,
} from "./api/templates";
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
} from "./api/attachments";
export {
  listStars,
  setPageStar,
  setSpaceStar,
  listRecentPages,
  listMyDrafts,
  listPersonPages,
  listMyTasks,
  setTaskDone,
  listPageReactions,
  setPageReaction,
  setCommentReaction,
} from "./api/personal";
export {
  listSpaceDeletions,
  listAudit,
  listGrantAudit,
  getSearchIndexStatus,
  startReindex,
  getReindexJob,
} from "./api/admin";
export { searchContent } from "./api/search";
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
} from "./api/migrations";
