// src/features/wiki/store/types.ts
// 도메인 모델의 원천 — 정의는 도메인별로 `model/*.ts`에 있고 이 파일은 다시 내보내기만 한다.
// 화면·스토어는 계속 `./types`(이 파일)에서 가져온다. 백엔드 계약 문서의 엔티티 표와 1:1을 유지한다.

export {
  PageConflictError,
  MoveImpactError,
  type PageType,
  type PageStatus,
  type Page,
  type VerificationState,
  type PageVersion,
  type VersionPage,
  type UpdatePageOptions,
  type CopyPageOptions,
  type PageTemplate,
  type TemplateInput,
  type PagePath,
  type DeletePageOptions,
  type BlogPost,
  type BlogPostPage,
  type TrashItem,
  type PageRestoreResult,
  type PageNode,
  type LabelCount,
  type TrashEntry,
} from "./model/pages";
export type { Space, SpaceGrant } from "./model/spaces";
export {
  REACTION_EMOJIS,
  type CommentKind,
  type CommentThreadPage,
  type Comment,
  type ReactionSummary,
  type CommentAnchor,
} from "./model/comments";
export type { Attachment, AttachmentVersion, AttachmentUploadOptions } from "./model/attachments";
export {
  CollaborationDraftResetError,
  type CollaborationTicket,
  type CollaborationBootstrap,
  type CollaborationDraftCommit,
  type CollaborationDraftCommitOptions,
} from "./model/collaboration";
export {
  ContentSearchError,
  type SearchDocType,
  type SearchPageType,
  type SearchHit,
  type SearchResults,
  type SearchContentInput,
  type SearchSort,
  type SearchIndexStatus,
  type ReindexJob,
  type ContentSearchErrorKind,
} from "./model/search";
export type { StarsSnapshot, StarredPageRow, PersonPageRow, FeedPageRow, MyTask } from "./model/personal";
export type {
  User,
  AuditEntry,
  RestrictionPrincipalType,
  RestrictionPrincipal,
  InheritedRestriction,
  PageRestrictions,
  Team,
  OrgMemberStatus,
  OrgMe,
  PersonProfile,
  OrgMockState,
  OrgMockGrant,
  OrgMockGrantAudit,
  OrgMockInvitation,
  TeamMember,
} from "./model/org";
export type {
  NotificationType,
  Notification,
  NotificationPrefs,
  NotificationPrefsPatch,
  NotificationQuery,
  WatchedPage,
  WatchedSpace,
  WatchList,
  NotificationList,
} from "./model/notifications";
export type {
  MigrationProvider,
  MigrationMode,
  MigrationJobStatus,
  MigrationItemStatus,
  MigrationStage,
  MigrationIssueSeverity,
  MigrationSourceInput,
  MigrationSourceProbe,
  MigrationSourceSummary,
  MigrationCounts,
  MigrationJobSummary,
  MigrationJob,
  MigrationJobIssue,
  MigrationLinkFixupResult,
  MigrationDiscoverResult,
  MigrationItem,
  MigrationItemPage,
  MigrationItemFilter,
  MigrationIssueSummary,
  MigrationDeadLetter,
  MigrationReport,
  MigrationJobRecord,
} from "./model/migrations";
export type { WikiData } from "./model/mockData";
