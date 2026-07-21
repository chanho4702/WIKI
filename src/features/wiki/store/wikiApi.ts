// wiki-backend 어댑터. 각 태스크에서 REST 구현으로 교체한다. 미구현분은 목업 위임.
export {
  listUsers, getCurrentUser, listSpaces, createSpace, listPages, getPage,
  createPage, updatePage, deletePage, movePage, listVersions, restoreVersion,
  listComments, addComment, updateComment, deleteComment, __resetForTest,
} from "./wikiMock";
