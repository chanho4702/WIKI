// src/features/wiki/store/wikiStore.ts
// 듀얼모드 진입점 — VITE_API_BASE가 있으면 백엔드 어댑터(wikiApi), 없으면 목업(wikiMock).
// 공개 함수 시그니처·의미론은 store/CLAUDE.md 계약 그대로. 화면·테스트는 이 모듈만 import한다.
import * as mock from "./wikiMock";
import * as api from "./wikiApi";
import { USE_BACKEND } from "./apiClient";

const impl = USE_BACKEND ? api : mock;

export const listUsers = impl.listUsers;
export const getCurrentUser = impl.getCurrentUser;
export const listSpaces = impl.listSpaces;
export const createSpace = impl.createSpace;
export const listPages = impl.listPages;
export const getPage = impl.getPage;
export const createPage = impl.createPage;
export const updatePage = impl.updatePage;
export const deletePage = impl.deletePage;
export const movePage = impl.movePage;
export const listVersions = impl.listVersions;
export const restoreVersion = impl.restoreVersion;
export const listComments = impl.listComments;
export const addComment = impl.addComment;
export const updateComment = impl.updateComment;
export const deleteComment = impl.deleteComment;

// 테스트 전용 — 항상 목업 캐시를 초기화(백엔드 모드에선 테스트를 돌리지 않음).
export const __resetForTest = mock.__resetForTest;
